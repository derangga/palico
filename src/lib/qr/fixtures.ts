// Test helpers: draw a QR code as pixels, then damage it the way real photos
// do. Not imported by app code.

import type { Frame } from "./binarize.ts";
import type { QrCode } from "./encode.ts";
import { type Pair, project, solveHomography } from "./geometry.ts";

export interface RenderOptions {
	/** Pixels per module. */
	readonly scale?: number;
	/** Quiet zone in modules. */
	readonly border?: number;
	/** Gray level of dark modules and of the background (0 to 255). */
	readonly dark?: number;
	readonly light?: number;
}

export function renderFrame(qr: QrCode, options: RenderOptions = {}): Frame {
	const { scale = 4, border = 4, dark = 0, light = 255 } = options;
	const width = (qr.size + border * 2) * scale;
	const data = new Uint8ClampedArray(width * width * 4);

	for (let y = 0; y < width; y++) {
		for (let x = 0; x < width; x++) {
			const mx = Math.floor(x / scale) - border;
			const my = Math.floor(y / scale) - border;
			const inside = mx >= 0 && my >= 0 && mx < qr.size && my < qr.size;

			const value =
				inside && qr.modules[my * qr.size + mx] === 1 ? dark : light;

			const o = (y * width + x) * 4;

			data[o] = data[o + 1] = data[o + 2] = value;
			data[o + 3] = 255;
		}
	}

	return { width, height: width, data };
}

const gray = (frame: Frame, x: number, y: number): number =>
	frame.data[(y * frame.width + x) * 4]!;

function fromGray(width: number, height: number, values: Float32Array): Frame {
	const data = new Uint8ClampedArray(width * height * 4);

	for (let i = 0; i < values.length; i++) {
		data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = values[i]!;
		data[i * 4 + 3] = 255;
	}

	return { width, height, data };
}

export function rotate(frame: Frame, quarterTurns: number): Frame {
	let current = frame;

	for (let turn = 0; turn < quarterTurns % 4; turn++) {
		const { width, height } = current;
		const values = new Float32Array(width * height);

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++)
				values[x * height + (height - 1 - y)] = gray(current, x, y);
		}

		current = fromGray(height, width, values);
	}

	return current;
}

export function invert(frame: Frame): Frame {
	const values = new Float32Array(frame.width * frame.height);

	for (let i = 0; i < values.length; i++) values[i] = 255 - frame.data[i * 4]!;

	return fromGray(frame.width, frame.height, values);
}

/** A seeded generator so failures reproduce. */
export function seeded(seed: number): () => number {
	let state = seed >>> 0;

	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;

		return state / 4294967296;
	};
}

export function addNoise(
	frame: Frame,
	amount: number,
	random: () => number,
): Frame {
	const values = new Float32Array(frame.width * frame.height);

	for (let i = 0; i < values.length; i++) {
		values[i] = frame.data[i * 4]! + (random() - 0.5) * 2 * amount;
	}

	return fromGray(frame.width, frame.height, values);
}

/** Box blur, the cheap stand-in for a soft lens or motion. */
export function blur(frame: Frame, radius: number): Frame {
	const { width, height } = frame;
	const values = new Float32Array(width * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;
			let count = 0;

			for (let dy = -radius; dy <= radius; dy++) {
				for (let dx = -radius; dx <= radius; dx++) {
					const px = x + dx;
					const py = y + dy;

					if (px < 0 || py < 0 || px >= width || py >= height) continue;

					sum += gray(frame, px, py);
					count++;
				}
			}

			values[y * width + x] = sum / count;
		}
	}

	return fromGray(width, height, values);
}

/** Puts the code on a larger canvas with a lighting gradient across it. */
export function placeOnCanvas(
	frame: Frame,
	canvasWidth: number,
	canvasHeight: number,
	left: number,
	top: number,
	shade: number,
): Frame {
	const values = new Float32Array(canvasWidth * canvasHeight);

	for (let y = 0; y < canvasHeight; y++) {
		for (let x = 0; x < canvasWidth; x++) {
			const sx = x - left;
			const sy = y - top;

			const inside =
				sx >= 0 && sy >= 0 && sx < frame.width && sy < frame.height;

			const base = inside ? gray(frame, sx, sy) : 235;
			const light = 1 - shade * (x / canvasWidth);

			values[y * canvasWidth + x] = base * light;
		}
	}

	return fromGray(canvasWidth, canvasHeight, values);
}

/**
 * Maps the frame onto a quadrilateral in a new canvas, as if photographed at
 * an angle. `quad` lists where the top-left, top-right, bottom-right and
 * bottom-left corners land. Bilinear sampling; the rest is paper-colored.
 */
export function perspective(
	frame: Frame,
	canvasWidth: number,
	canvasHeight: number,
	quad: ReadonlyArray<Pair>,
): Frame {
	const source: Pair[] = [
		[0, 0],
		[frame.width, 0],
		[frame.width, frame.height],
		[0, frame.height],
	];

	const inverse = solveHomography(quad, source);

	if (!inverse) throw new Error("degenerate quad");

	const values = new Float32Array(canvasWidth * canvasHeight).fill(235);

	for (let y = 0; y < canvasHeight; y++) {
		for (let x = 0; x < canvasWidth; x++) {
			const [sx, sy] = project(inverse, x + 0.5, y + 0.5);

			if (sx < 0 || sy < 0 || sx >= frame.width - 1 || sy >= frame.height - 1)
				continue;

			const x0 = Math.floor(sx);
			const y0 = Math.floor(sy);
			const fx = sx - x0;
			const fy = sy - y0;
			const top = gray(frame, x0, y0) * (1 - fx) + gray(frame, x0 + 1, y0) * fx;

			const bottom =
				gray(frame, x0, y0 + 1) * (1 - fx) + gray(frame, x0 + 1, y0 + 1) * fx;

			values[y * canvasWidth + x] = top * (1 - fy) + bottom * fy;
		}
	}

	return fromGray(canvasWidth, canvasHeight, values);
}

import { Effect } from "effect";

import { OcrPreprocessError } from "./errors.ts";

// Canvas-only preprocessing to lift OCR accuracy on real-world photos:
// grayscale → adaptive (local) threshold, which flattens uneven lighting and
// shadows a global threshold would smear → small-angle deskew via projection
// profile. Screenshots stay effectively unchanged: already-crisp text survives
// binarization and a straight page detects ~0° skew (a no-op rotation).
//
// ponytail: pure-canvas heuristics, no OpenCV.js. Upgrade to OpenCV's
// adaptiveThreshold + minAreaRect/HoughLines deskew (palico-iwl) only if real
// photos still disappoint — that pulls in a multi-MB WASM dep this avoids.

// Rec. 601 luma. Output is one byte per pixel.
export const toGrayscale = (rgba: Uint8ClampedArray): Uint8Array => {
	const gray = new Uint8Array(rgba.length / 4);
	for (let p = 0, i = 0; i < rgba.length; p++, i += 4) {
		gray[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
	}
	return gray;
};

// Bradley–Roth adaptive threshold via an integral image: a pixel is ink when it
// is `t`% darker than the mean of its S×S neighbourhood. Returns 1 = ink, 0 =
// paper. Local means beat a single global cutoff on shadowed / gradient-lit pages.
export const adaptiveThreshold = (
	gray: Uint8Array,
	width: number,
	height: number,
): Uint8Array => {
	const window = Math.max(8, Math.floor(Math.max(width, height) / 24));
	const half = window >> 1;
	const t = 12; // percent below local mean to count as ink

	// Integral image, dimensions (width+1) × (height+1) so row/col 0 is zero-pad.
	const iw = width + 1;
	const integral = new Float64Array(iw * (height + 1));
	for (let y = 0; y < height; y++) {
		let rowSum = 0;
		for (let x = 0; x < width; x++) {
			rowSum += gray[y * width + x];
			integral[(y + 1) * iw + (x + 1)] = integral[y * iw + (x + 1)] + rowSum;
		}
	}

	const ink = new Uint8Array(width * height);
	for (let y = 0; y < height; y++) {
		const y1 = Math.max(0, y - half);
		const y2 = Math.min(height - 1, y + half);
		for (let x = 0; x < width; x++) {
			const x1 = Math.max(0, x - half);
			const x2 = Math.min(width - 1, x + half);
			const count = (x2 - x1 + 1) * (y2 - y1 + 1);
			const sum =
				integral[(y2 + 1) * iw + (x2 + 1)] -
				integral[y1 * iw + (x2 + 1)] -
				integral[(y2 + 1) * iw + x1] +
				integral[y1 * iw + x1];
			// gray < mean * (1 - t/100)  ⇔  gray*count*100 < sum*(100 - t)
			if (gray[y * width + x] * count * 100 < sum * (100 - t)) {
				ink[y * width + x] = 1;
			}
		}
	}
	return ink;
};

// Estimate page skew by projection profile: shear the ink mask by each candidate
// angle and score how tightly ink stacks into rows (Σ rowCount²). Aligned text
// concentrates into few dense rows, maximising the score. Returns degrees.
export const detectSkewDegrees = (
	ink: Uint8Array,
	width: number,
	height: number,
	maxDegrees = 8,
	step = 0.5,
): number => {
	// Cap work regardless of image size — an estimate needs only a sample.
	const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 200_000)));

	let bestScore = -1;
	let bestDeg = 0;
	for (let deg = -maxDegrees; deg <= maxDegrees; deg += step) {
		const tan = Math.tan((deg * Math.PI) / 180);
		const profile = new Float64Array(height);
		for (let y = 0; y < height; y += stride) {
			for (let x = 0; x < width; x += stride) {
				if (ink[y * width + x] === 0) continue;
				const yy = y + Math.round(x * tan);
				if (yy >= 0 && yy < height) profile[yy]++;
			}
		}
		let score = 0;
		for (let i = 0; i < height; i++) score += profile[i] * profile[i];
		if (score > bestScore) {
			bestScore = score;
			bestDeg = deg;
		}
	}
	return bestDeg;
};

const loadImage = (url: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not decode image."));
		img.src = url;
	});

const get2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D => {
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) throw new Error("Canvas 2D context unavailable.");
	return ctx;
};

// Below this skew, a deskew rotation isn't worth the resample.
const DESKEW_THRESHOLD_DEG = 0.5;

// Paint the binarised ink mask (black text on white) rotated level by `deg`.
// The output canvas grows to the rotated bounding box on a white
// background, so nothing is clipped and margins stay paper-white for OCR.
const renderBinary = (
	ink: Uint8Array,
	width: number,
	height: number,
	deg: number,
): HTMLCanvasElement => {
	const src = document.createElement("canvas");
	src.width = width;
	src.height = height;
	const sctx = get2d(src);
	const image = sctx.createImageData(width, height);
	for (let p = 0; p < ink.length; p++) {
		const v = ink[p] === 1 ? 0 : 255;
		image.data[p * 4] = v;
		image.data[p * 4 + 1] = v;
		image.data[p * 4 + 2] = v;
		image.data[p * 4 + 3] = 255;
	}
	sctx.putImageData(image, 0, 0);

	if (Math.abs(deg) < DESKEW_THRESHOLD_DEG) return src;

	// `deg` is the shear that flattens the projection; the same signed angle
	// rotates the page level (canvas rotate() is clockwise for positive radians).
	const rad = (deg * Math.PI) / 180;
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));
	const out = document.createElement("canvas");
	out.width = Math.ceil(width * cos + height * sin);
	out.height = Math.ceil(width * sin + height * cos);
	const octx = get2d(out);
	octx.fillStyle = "#ffffff";
	octx.fillRect(0, 0, out.width, out.height);
	octx.translate(out.width / 2, out.height / 2);
	octx.rotate(rad);
	octx.drawImage(src, -width / 2, -height / 2);
	return out;
};

export const preprocessForOcr = (
	file: Blob,
): Effect.Effect<Blob, OcrPreprocessError> =>
	Effect.acquireUseRelease(
		Effect.sync(() => URL.createObjectURL(file)),
		(url) =>
			Effect.tryPromise({
				try: async () => {
					const img = await loadImage(url);
					const width = img.naturalWidth || img.width;
					const height = img.naturalHeight || img.height;
					const canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					const ctx = get2d(canvas);
					ctx.drawImage(img, 0, 0);

					const { data } = ctx.getImageData(0, 0, width, height);
					const gray = toGrayscale(data);
					const ink = adaptiveThreshold(gray, width, height);
					const deg = detectSkewDegrees(ink, width, height);
					const out = renderBinary(ink, width, height, deg);

					return await new Promise<Blob>((resolve, reject) => {
						out.toBlob(
							(b) => (b ? resolve(b) : reject(new Error("Failed to encode."))),
							"image/png",
						);
					});
				},
				catch: (err) =>
					new OcrPreprocessError({
						message:
							err instanceof Error
								? err.message
								: "Could not preprocess image.",
					}),
			}),
		(url) => Effect.sync(() => URL.revokeObjectURL(url)),
	);

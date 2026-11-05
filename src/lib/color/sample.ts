// The pixel arithmetic of the image picker: where a pointer or an arrow key
// lands, and what color sits there. Pure functions, so tests cover the edges.

import type { Rgb } from "./oklab.ts";

export interface PixelPoint {
	/** Column, 0 at the left edge. */
	readonly x: number;
	/** Row, 0 at the top edge. */
	readonly y: number;
}

export interface PixelSize {
	readonly width: number;
	readonly height: number;
}

/** A rectangle on screen, as `getBoundingClientRect` reports it. */
export interface PixelBox extends PixelSize {
	readonly left: number;
	readonly top: number;
}

export interface PickedPixel {
	readonly rgb: Rgb;
	/** True when the pixel is visible enough to have a color worth reporting. */
	readonly opaque: boolean;
}

/** The same cut-off as the palette extractor: below this alpha a pixel counts as empty. */
const MIN_ALPHA = 128;

/** How far the readout looks around the cursor. 5 gives an 11 by 11 window. */
export const WINDOW_RADIUS = 5;

export const WINDOW_SIDE = WINDOW_RADIUS * 2 + 1;

const clamp = (value: number, max: number): number =>
	Math.min(max, Math.max(0, value));

/**
 * The pixel under a pointer. `box` is the canvas as drawn on screen, which is
 * usually a different size from the image, so the position is scaled.
 */
export function pointFromPointer(
	client: PixelPoint,
	box: PixelBox,
	image: PixelSize,
): PixelPoint {
	// A canvas that is not laid out yet has no size to divide by.
	if (box.width === 0 || box.height === 0) return { x: 0, y: 0 };

	return {
		x: clamp(
			Math.floor(((client.x - box.left) / box.width) * image.width),
			image.width - 1,
		),
		y: clamp(
			Math.floor(((client.y - box.top) / box.height) * image.height),
			image.height - 1,
		),
	};
}

const ARROWS = new Map<string, PixelPoint>([
	["ArrowLeft", { x: -1, y: 0 }],
	["ArrowRight", { x: 1, y: 0 }],
	["ArrowUp", { x: 0, y: -1 }],
	["ArrowDown", { x: 0, y: 1 }],
]);

/** Moves the cursor one arrow key at a time, and stops at the edge. Undefined for any other key. */
export function moveCursor(
	from: PixelPoint,
	key: string,
	step: number,
	image: PixelSize,
): PixelPoint | undefined {
	const direction = ARROWS.get(key);

	if (!direction) return undefined;

	return {
		x: clamp(from.x + direction.x * step, image.width - 1),
		y: clamp(from.y + direction.y * step, image.height - 1),
	};
}

/** The top-left corner of the window to read around a point. It may sit outside the image. */
export const windowOrigin = (point: PixelPoint): PixelPoint => ({
	x: point.x - WINDOW_RADIUS,
	y: point.y - WINDOW_RADIUS,
});

/** One pixel of RGBA data, `column` and `row` counted from the top left of a `width` pixel wide buffer. */
export function readPixel(
	data: Uint8ClampedArray,
	width: number,
	column: number,
	row: number,
): PickedPixel | undefined {
	const start = (row * width + column) * 4;
	const alpha = data[start + 3];

	if (column < 0 || column >= width || start < 0 || alpha === undefined) {
		return undefined;
	}

	return {
		rgb: {
			r: data[start] ?? 0,
			g: data[start + 1] ?? 0,
			b: data[start + 2] ?? 0,
		},
		opaque: alpha >= MIN_ALPHA,
	};
}

/** The pixel in the middle of a window read with `windowOrigin`. */
export const centerPixel = (data: Uint8ClampedArray): PickedPixel | undefined =>
	readPixel(data, WINDOW_SIDE, WINDOW_RADIUS, WINDOW_RADIUS);

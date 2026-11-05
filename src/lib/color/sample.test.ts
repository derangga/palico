import { describe, expect, it } from "vitest";

import {
	centerPixel,
	moveCursor,
	pointFromPointer,
	readPixel,
	WINDOW_RADIUS,
	WINDOW_SIDE,
	windowOrigin,
} from "./sample.ts";

const IMAGE = { width: 100, height: 50 };

describe("pointFromPointer", () => {
	const box = { left: 10, top: 20, width: 200, height: 100 };

	it("scales a position on screen to a pixel of the image", () => {
		expect(pointFromPointer({ x: 110, y: 70 }, box, IMAGE)).toEqual({
			x: 50,
			y: 25,
		});
	});

	it("rounds down inside a pixel, not to the nearest one", () => {
		// 2 screen pixels per image pixel: x 11 is the left half of pixel 0, x 13 of pixel 1.
		expect(pointFromPointer({ x: 11, y: 21 }, box, IMAGE)).toEqual({
			x: 0,
			y: 0,
		});

		expect(pointFromPointer({ x: 13, y: 23 }, box, IMAGE)).toEqual({
			x: 1,
			y: 1,
		});
	});

	it("puts the top left corner on pixel 0, 0", () => {
		expect(pointFromPointer({ x: 10, y: 20 }, box, IMAGE)).toEqual({
			x: 0,
			y: 0,
		});
	});

	it("stays on the last pixel at the far edge", () => {
		expect(pointFromPointer({ x: 210, y: 120 }, box, IMAGE)).toEqual({
			x: 99,
			y: 49,
		});
	});

	it("clamps a drag that leaves the canvas", () => {
		expect(pointFromPointer({ x: -500, y: 9999 }, box, IMAGE)).toEqual({
			x: 0,
			y: 49,
		});
	});

	it("falls back to the corner before the canvas has a size", () => {
		const unlaidOut = { left: 0, top: 0, width: 0, height: 0 };

		expect(pointFromPointer({ x: 5, y: 5 }, unlaidOut, IMAGE)).toEqual({
			x: 0,
			y: 0,
		});
	});
});

describe("moveCursor", () => {
	const from = { x: 50, y: 25 };

	it("moves one pixel per arrow key", () => {
		expect(moveCursor(from, "ArrowLeft", 1, IMAGE)).toEqual({ x: 49, y: 25 });
		expect(moveCursor(from, "ArrowRight", 1, IMAGE)).toEqual({ x: 51, y: 25 });
		expect(moveCursor(from, "ArrowUp", 1, IMAGE)).toEqual({ x: 50, y: 24 });
		expect(moveCursor(from, "ArrowDown", 1, IMAGE)).toEqual({ x: 50, y: 26 });
	});

	it("takes a larger step", () => {
		expect(moveCursor(from, "ArrowRight", 10, IMAGE)).toEqual({ x: 60, y: 25 });
	});

	it("stops at every edge", () => {
		expect(moveCursor({ x: 0, y: 0 }, "ArrowLeft", 10, IMAGE)).toEqual({
			x: 0,
			y: 0,
		});

		expect(moveCursor({ x: 0, y: 0 }, "ArrowUp", 10, IMAGE)).toEqual({
			x: 0,
			y: 0,
		});

		expect(moveCursor({ x: 95, y: 45 }, "ArrowRight", 10, IMAGE)).toEqual({
			x: 99,
			y: 45,
		});

		expect(moveCursor({ x: 95, y: 45 }, "ArrowDown", 10, IMAGE)).toEqual({
			x: 95,
			y: 49,
		});
	});

	it("ignores keys that are not arrows", () => {
		expect(moveCursor(from, "Enter", 1, IMAGE)).toBeUndefined();
		expect(moveCursor(from, "a", 1, IMAGE)).toBeUndefined();
	});
});

describe("readPixel", () => {
	// Two pixels wide, two tall.
	const data = new Uint8ClampedArray([
		10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 127, 100, 110, 120, 128,
	]);

	it("reads the color at a column and row", () => {
		expect(readPixel(data, 2, 1, 0)?.rgb).toEqual({ r: 40, g: 50, b: 60 });
		expect(readPixel(data, 2, 0, 1)?.rgb).toEqual({ r: 70, g: 80, b: 90 });
	});

	it("calls a pixel opaque from alpha 128 up", () => {
		expect(readPixel(data, 2, 0, 0)?.opaque).toBe(true);
		expect(readPixel(data, 2, 1, 1)?.opaque).toBe(true);
		expect(readPixel(data, 2, 0, 1)?.opaque).toBe(false);
	});

	it("returns nothing outside the buffer", () => {
		expect(readPixel(data, 2, -1, 0)).toBeUndefined();
		expect(readPixel(data, 2, 2, 0)).toBeUndefined();
		expect(readPixel(data, 2, 0, 2)).toBeUndefined();
		expect(readPixel(data, 2, 0, -1)).toBeUndefined();
	});
});

describe("the readout window", () => {
	it("is an odd square, so the cursor sits in the middle cell", () => {
		expect(WINDOW_SIDE).toBe(11);
		expect(WINDOW_SIDE % 2).toBe(1);
	});

	it("starts half a window up and left of the cursor, even past the corner", () => {
		expect(windowOrigin({ x: 50, y: 25 })).toEqual({ x: 45, y: 20 });
		expect(windowOrigin({ x: 0, y: 0 })).toEqual({ x: -5, y: -5 });
	});

	it("reads the cursor pixel from the middle of a window", () => {
		const data = new Uint8ClampedArray(WINDOW_SIDE * WINDOW_SIDE * 4);
		const middle = (WINDOW_RADIUS * WINDOW_SIDE + WINDOW_RADIUS) * 4;

		data.set([12, 34, 56, 255], middle);

		expect(centerPixel(data)).toEqual({
			rgb: { r: 12, g: 34, b: 56 },
			opaque: true,
		});
	});

	it("reports a cursor on a clipped edge as transparent", () => {
		const empty = new Uint8ClampedArray(WINDOW_SIDE * WINDOW_SIDE * 4);

		expect(centerPixel(empty)?.opaque).toBe(false);
	});
});

import { describe, expect, it } from "vitest";

import {
	adaptiveThreshold,
	detectSkewDegrees,
	toGrayscale,
} from "./preprocess.ts";

const rgba = (pixels: Array<[number, number, number]>): Uint8ClampedArray => {
	const out = new Uint8ClampedArray(pixels.length * 4);
	pixels.forEach(([r, g, b], i) => {
		out[i * 4] = r;
		out[i * 4 + 1] = g;
		out[i * 4 + 2] = b;
		out[i * 4 + 3] = 255;
	});
	return out;
};

describe("toGrayscale", () => {
	it("maps black→0, white→255 and averages by luma weights", () => {
		const gray = toGrayscale(
			rgba([
				[0, 0, 0],
				[255, 255, 255],
				[0, 255, 0], // green is the heaviest luma channel
			]),
		);
		expect(gray[0]).toBe(0);
		expect(gray[1]).toBe(255);
		expect(gray[2]).toBe(149); // ~0.587 * 255
	});
});

describe("adaptiveThreshold", () => {
	it("flags dark text on a light page as ink and leaves paper clear", () => {
		const w = 20;
		const h = 20;
		const gray = new Uint8Array(w * h).fill(230); // light paper
		// a dark 4×4 glyph
		for (let y = 8; y < 12; y++)
			for (let x = 8; x < 12; x++) gray[y * w + x] = 30;

		const ink = adaptiveThreshold(gray, w, h);
		expect(ink[9 * w + 9]).toBe(1); // inside the glyph → ink
		expect(ink[1 * w + 1]).toBe(0); // paper corner → not ink
	});

	it("survives a lighting gradient a global threshold would smear", () => {
		const w = 40;
		const h = 10;
		const gray = new Uint8Array(w * h);
		// horizontal brightness gradient: bright left → dark right
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) gray[y * w + x] = 255 - x * 5;
		// stamp darker-than-local ink on both the bright and dark ends
		for (let y = 3; y < 7; y++) {
			gray[y * w + 2] = 20; // bright side
			gray[y * w + 37] = 20; // dark side (still local-min)
		}
		const ink = adaptiveThreshold(gray, w, h);
		expect(ink[5 * w + 2]).toBe(1);
		expect(ink[5 * w + 37]).toBe(1);
	});
});

describe("detectSkewDegrees", () => {
	const tiltedText = (w: number, h: number, slope: number): Uint8Array => {
		const ink = new Uint8Array(w * h);
		// three baselines sloping by `slope` (Δy per Δx), y-down coords
		for (const base of [Math.floor(h * 0.3), Math.floor(h * 0.6)]) {
			for (let x = 0; x < w; x++) {
				const y = base + Math.round(x * slope);
				if (y >= 0 && y < h) ink[y * w + x] = 1;
			}
		}
		return ink;
	};

	it("detects ~0° for level text", () => {
		const deg = detectSkewDegrees(tiltedText(120, 80, 0), 120, 80);
		expect(Math.abs(deg)).toBeLessThanOrEqual(0.5);
	});

	it("returns a negative shear angle for text sloping down-right", () => {
		// slope +tan(4°) ≈ 0.07 → the flattening shear is the opposite sign
		const deg = detectSkewDegrees(
			tiltedText(120, 80, Math.tan((4 * Math.PI) / 180)),
			120,
			80,
		);
		expect(deg).toBeLessThan(0);
		expect(deg).toBeGreaterThan(-8);
		expect(Math.abs(deg + 4)).toBeLessThanOrEqual(1); // ≈ -4°
	});
});

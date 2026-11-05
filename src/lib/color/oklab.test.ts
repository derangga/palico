import { describe, expect, it } from "vitest";

import {
	oklabDistance,
	oklabToOklch,
	oklabToRgb,
	oklchToOklab,
	type Rgb,
	rgbToOklab,
} from "./oklab.ts";

describe("rgbToOklab", () => {
	it("maps black to zero", () => {
		const lab = rgbToOklab({ r: 0, g: 0, b: 0 });

		expect(lab.L).toBeCloseTo(0, 5);
		expect(lab.a).toBeCloseTo(0, 5);
		expect(lab.b).toBeCloseTo(0, 5);
	});

	it("maps white to full lightness with no color", () => {
		const lab = rgbToOklab({ r: 255, g: 255, b: 255 });

		expect(lab.L).toBeCloseTo(1, 4);
		expect(lab.a).toBeCloseTo(0, 4);
		expect(lab.b).toBeCloseTo(0, 4);
	});

	it("matches the published value for sRGB red", () => {
		const lab = rgbToOklab({ r: 255, g: 0, b: 0 });

		expect(lab.L).toBeCloseTo(0.628, 3);
		expect(lab.a).toBeCloseTo(0.2249, 3);
		expect(lab.b).toBeCloseTo(0.1258, 3);
	});
});

describe("oklabToRgb", () => {
	it("round-trips a spread of colors exactly", () => {
		const colors: ReadonlyArray<Rgb> = [
			{ r: 0, g: 0, b: 0 },
			{ r: 255, g: 255, b: 255 },
			{ r: 255, g: 0, b: 0 },
			{ r: 0, g: 255, b: 0 },
			{ r: 0, g: 0, b: 255 },
			{ r: 255, g: 99, b: 71 },
			{ r: 18, g: 52, b: 86 },
			{ r: 128, g: 128, b: 128 },
		];

		for (const color of colors) {
			expect(oklabToRgb(rgbToOklab(color))).toEqual(color);
		}
	});

	it("clamps a color outside sRGB instead of overflowing", () => {
		const rgb = oklabToRgb({ L: 0.9, a: 0.4, b: 0.3 });

		for (const channel of [rgb.r, rgb.g, rgb.b]) {
			expect(channel).toBeGreaterThanOrEqual(0);
			expect(channel).toBeLessThanOrEqual(255);
		}
	});
});

describe("oklabToOklch", () => {
	it("gives red a chroma near 0.258 and a hue near 29 degrees", () => {
		const { C, h } = oklabToOklch(rgbToOklab({ r: 255, g: 0, b: 0 }));

		expect(C).toBeCloseTo(0.2577, 3);
		expect(h).toBeCloseTo(29.23, 1);
	});

	it("keeps hue between 0 and 360", () => {
		const { h } = oklabToOklch(rgbToOklab({ r: 0, g: 0, b: 255 }));

		expect(h).toBeCloseTo(264.05, 1);
	});

	it("reports hue 0 for a gray", () => {
		expect(oklabToOklch(rgbToOklab({ r: 90, g: 90, b: 90 })).h).toBe(0);
	});
});

describe("oklabDistance", () => {
	it("is zero for the same color and grows with difference", () => {
		const red = rgbToOklab({ r: 255, g: 0, b: 0 });
		const pink = rgbToOklab({ r: 255, g: 120, b: 120 });
		const blue = rgbToOklab({ r: 0, g: 0, b: 255 });

		expect(oklabDistance(red, red)).toBe(0);
		expect(oklabDistance(red, pink)).toBeLessThan(oklabDistance(red, blue));
	});
});

describe("oklchToOklab", () => {
	it("undoes oklabToOklch", () => {
		const colors: ReadonlyArray<Rgb> = [
			{ r: 255, g: 0, b: 0 },
			{ r: 30, g: 144, b: 255 },
			{ r: 136, g: 57, b: 239 },
			{ r: 223, g: 142, b: 29 },
		];

		for (const color of colors) {
			const lab = rgbToOklab(color);
			const back = oklchToOklab(oklabToOklch(lab));

			expect(back.L).toBeCloseTo(lab.L, 9);
			expect(back.a).toBeCloseTo(lab.a, 9);
			expect(back.b).toBeCloseTo(lab.b, 9);
		}
	});

	it("puts a hue of 0 on the positive a axis and 90 on the positive b axis", () => {
		const east = oklchToOklab({ L: 0.5, C: 0.1, h: 0 });
		const north = oklchToOklab({ L: 0.5, C: 0.1, h: 90 });

		expect(east.a).toBeCloseTo(0.1, 9);
		expect(east.b).toBeCloseTo(0, 9);
		expect(north.a).toBeCloseTo(0, 9);
		expect(north.b).toBeCloseTo(0.1, 9);
	});
});

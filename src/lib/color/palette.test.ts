import { describe, expect, it } from "vitest";

import { oklabDistance, oklabToRgb, type Rgb, rgbToOklab } from "./oklab.ts";
import { extractPalette } from "./palette.ts";

type Run = readonly [color: Rgb, pixels: number, alpha?: number];

// Builds an RGBA buffer from runs of one color.
function image(runs: ReadonlyArray<Run>): Uint8ClampedArray {
	const total = runs.reduce((sum, [, count]) => sum + count, 0);
	const data = new Uint8ClampedArray(total * 4);
	let offset = 0;

	for (const [{ r, g, b }, count, alpha = 255] of runs) {
		for (let i = 0; i < count; i++) {
			data.set([r, g, b, alpha], offset);
			offset += 4;
		}
	}

	return data;
}

const red: Rgb = { r: 255, g: 0, b: 0 };
const blue: Rgb = { r: 0, g: 0, b: 255 };
const green: Rgb = { r: 0, g: 160, b: 40 };
const white: Rgb = { r: 255, g: 255, b: 255 };

// Within one channel step: the palette goes through OKLab and back.
function expectColor(actual: Rgb | undefined, expected: Rgb) {
	expect(actual).toBeDefined();
	expect(Math.abs(actual!.r - expected.r)).toBeLessThanOrEqual(1);
	expect(Math.abs(actual!.g - expected.g)).toBeLessThanOrEqual(1);
	expect(Math.abs(actual!.b - expected.b)).toBeLessThanOrEqual(1);
}

describe("extractPalette", () => {
	it("returns both colors of a two-color image with their shares", () => {
		const palette = extractPalette(
			image([
				[red, 750],
				[blue, 250],
			]),
		);

		expect(palette).toHaveLength(2);
		expectColor(palette[0]?.rgb, red);
		expectColor(palette[1]?.rgb, blue);
		expect(palette[0]!.share).toBeCloseTo(0.75, 5);
		expect(palette[1]!.share).toBeCloseTo(0.25, 5);
	});

	it("returns one color for a flat image", () => {
		const palette = extractPalette(image([[green, 400]]));

		expect(palette).toHaveLength(1);
		expectColor(palette[0]?.rgb, green);
		expect(palette[0]!.share).toBeCloseTo(1, 5);
	});

	it("lists the biggest area first", () => {
		const palette = extractPalette(
			image([
				[blue, 100],
				[red, 300],
				[green, 200],
			]),
		);

		expect(palette.map((color) => Math.round(color.share * 100))).toEqual([
			50, 33, 17,
		]);
		expectColor(palette[0]?.rgb, red);
	});

	it("ignores transparent pixels and measures share over the visible ones", () => {
		const palette = extractPalette(
			image([
				[green, 500],
				[red, 500, 0],
			]),
		);

		expect(palette).toHaveLength(1);
		expectColor(palette[0]?.rgb, green);
		expect(palette[0]!.share).toBeCloseTo(1, 5);
	});

	it("counts a pixel at half opacity but not one just below it", () => {
		expect(extractPalette(image([[red, 100, 128]]))).toHaveLength(1);
		expect(extractPalette(image([[red, 100, 127]]))).toHaveLength(0);
	});

	it("returns nothing for an empty or fully transparent image", () => {
		expect(extractPalette(new Uint8ClampedArray(0))).toEqual([]);
		expect(extractPalette(image([[white, 64, 0]]))).toEqual([]);
	});

	it("ignores trailing bytes that do not make a whole pixel", () => {
		const palette = extractPalette(new Uint8ClampedArray([10, 20, 30, 255, 9]));

		expect(palette).toHaveLength(1);
	});

	it("folds shades that look alike into one color at their weighted average", () => {
		// Different bins (red 12 and 13), so the merge step does the folding.
		const base: Rgb = { r: 200, g: 50, b: 50 };
		const close: Rgb = { r: 216, g: 54, b: 50 };

		// The test only means something while these really read as one color.
		expect(oklabDistance(rgbToOklab(base), rgbToOklab(close))).toBeLessThan(
			0.05,
		);

		const palette = extractPalette(
			image([
				[base, 300],
				[close, 700],
			]),
		);

		const a = rgbToOklab(base);
		const b = rgbToOklab(close);

		const weighted = oklabToRgb({
			L: a.L * 0.3 + b.L * 0.7,
			a: a.a * 0.3 + b.a * 0.7,
			b: a.b * 0.3 + b.b * 0.7,
		});

		const unweighted = oklabToRgb({
			L: (a.L + b.L) / 2,
			a: (a.a + b.a) / 2,
			b: (a.b + b.b) / 2,
		});

		expect(palette).toHaveLength(1);
		expect(palette[0]!.share).toBeCloseTo(1, 5);
		expectColor(palette[0]?.rgb, weighted);
		// The plain average of the two would land somewhere else.
		expect(Math.abs(palette[0]!.rgb.r - unweighted.r)).toBeGreaterThan(1);
	});

	it("drops a speck below half a percent", () => {
		const palette = extractPalette(
			image([
				[white, 1000],
				[red, 1],
			]),
		);

		expect(palette).toHaveLength(1);
		expectColor(palette[0]?.rgb, white);
	});

	it("keeps a small accent that is above the cutoff", () => {
		const palette = extractPalette(
			image([
				[white, 900],
				[red, 100],
			]),
		);

		expect(palette).toHaveLength(2);
		expectColor(palette[1]?.rgb, red);
	});

	it("caps the result at maxColors", () => {
		const colors: ReadonlyArray<Rgb> = [
			{ r: 255, g: 0, b: 0 },
			{ r: 0, g: 200, b: 0 },
			{ r: 0, g: 0, b: 255 },
			{ r: 255, g: 255, b: 0 },
			{ r: 0, g: 255, b: 255 },
			{ r: 255, g: 0, b: 255 },
			{ r: 0, g: 0, b: 0 },
			{ r: 255, g: 255, b: 255 },
			{ r: 255, g: 128, b: 0 },
			{ r: 128, g: 0, b: 128 },
			{ r: 120, g: 72, b: 24 },
			{ r: 128, g: 128, b: 128 },
		];

		// Twelve colors that all read as different, so only the cap trims them.
		for (const [i, x] of colors.entries()) {
			for (const y of colors.slice(i + 1)) {
				expect(oklabDistance(rgbToOklab(x), rgbToOklab(y))).toBeGreaterThan(
					0.1,
				);
			}
		}

		const buffer = image(colors.map((color) => [color, 100] as const));

		expect(extractPalette(buffer, 4)).toHaveLength(4);
		expect(extractPalette(buffer)).toHaveLength(10);
	});

	it("averages mixed shades into the colors they came from", () => {
		const warm: Rgb = { r: 200, g: 60, b: 60 };
		const cool: Rgb = { r: 40, g: 90, b: 200 };
		const jittered = new Uint8ClampedArray(4000 * 4);
		let seed = 99;

		const wobble = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;

			return (seed >>> 29) - 3;
		};

		for (let i = 0; i < 4000; i++) {
			const { r, g, b } = i % 2 === 0 ? warm : cool;

			jittered.set([r + wobble(), g + wobble(), b + wobble(), 255], i * 4);
		}

		const palette = extractPalette(jittered);

		expect(palette).toHaveLength(2);
		expect(palette[0]!.share).toBeCloseTo(0.5, 2);
		expect(palette[1]!.share).toBeCloseTo(0.5, 2);

		const reds = palette.map((color) => color.rgb.r).toSorted((x, y) => x - y);

		expect(Math.abs(reds[0]! - cool.r)).toBeLessThanOrEqual(3);
		expect(Math.abs(reds[1]! - warm.r)).toBeLessThanOrEqual(3);
	});

	it("keeps a color at exactly the speck boundary and drops one just under", () => {
		// 5 of 1005 visible pixels is 0.498%, 6 of 1006 is 0.596%.
		expect(
			extractPalette(
				image([
					[white, 1000],
					[red, 5],
				]),
			),
		).toHaveLength(1);
		expect(
			extractPalette(
				image([
					[white, 1000],
					[red, 6],
				]),
			),
		).toHaveLength(2);
	});

	it("does not depend on the order of the pixels", () => {
		const forward = image([
			[red, 300],
			[blue, 200],
			[green, 150],
			[white, 90],
		]);

		const backward = new Uint8ClampedArray(forward.length);

		for (let i = 0; i < forward.length; i += 4) {
			backward.set(forward.subarray(i, i + 4), forward.length - 4 - i);
		}

		expect(extractPalette(backward)).toEqual(extractPalette(forward));
	});

	it("spreads a black to white gradient across the lightness range", () => {
		const steps = Array.from(
			{ length: 256 },
			(_, level) => [{ r: level, g: level, b: level }, 40] as const,
		);

		const palette = extractPalette(image(steps));
		const lightness = palette.map((color) => rgbToOklab(color.rgb).L);

		expect(palette.length).toBeGreaterThan(3);
		expect(palette.length).toBeLessThanOrEqual(10);
		expect(Math.min(...lightness)).toBeLessThan(0.3);
		expect(Math.max(...lightness)).toBeGreaterThan(0.8);
	});

	it("gives the same palette every time for the same pixels", () => {
		const buffer = image([
			[red, 300],
			[blue, 200],
			[green, 150],
			[white, 90],
		]);

		expect(extractPalette(buffer)).toEqual(extractPalette(buffer));
	});

	it("survives noise", () => {
		const noise = new Uint8ClampedArray(20_000 * 4);
		let seed = 12345;

		for (let i = 0; i < noise.length; i++) {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			noise[i] = i % 4 === 3 ? 255 : seed >>> 24;
		}

		const palette = extractPalette(noise);

		expect(palette.length).toBeGreaterThan(0);
		expect(palette.length).toBeLessThanOrEqual(10);

		for (const color of palette) {
			expect(color.share).toBeGreaterThan(0);
			expect(color.share).toBeLessThanOrEqual(1);
		}
	});
});

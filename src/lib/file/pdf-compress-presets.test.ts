import { describe, expect, it } from "vitest";

import {
	COMPRESS_PRESET_IDS,
	DEFAULT_COMPRESS_PRESET,
	fitToBudget,
	isSmaller,
	percentSaved,
	PRESETS,
	pixelBudget,
	widestBudget,
} from "./pdf-compress-presets.ts";

describe("PRESETS", () => {
	it("has one entry per id, Balanced as the default", () => {
		expect(Object.keys(PRESETS)).toEqual([...COMPRESS_PRESET_IDS]);
		expect(DEFAULT_COMPRESS_PRESET).toBe("balanced");
	});

	it("leaves images alone on Light and tightens from Balanced to Small", () => {
		expect(PRESETS.light.images).toBeNull();
		expect(PRESETS.balanced.images).toEqual({ maxDpi: 150, quality: 0.75 });
		expect(PRESETS.small.images).toEqual({ maxDpi: 100, quality: 0.6 });
	});
});

describe("pixelBudget", () => {
	it("is page inches times DPI, long side and short side", () => {
		// US Letter: 8.5 x 11 in.
		expect(pixelBudget(612, 792, 150)).toEqual({ long: 1650, short: 1275 });
		expect(pixelBudget(612, 792, 100)).toEqual({ long: 1100, short: 850 });
	});

	it("is the same for a page turned on its side", () => {
		expect(pixelBudget(792, 612, 150)).toEqual(pixelBudget(612, 792, 150));
	});

	it("scales the page by /UserUnit", () => {
		expect(pixelBudget(612, 792, 150, 2)).toEqual({ long: 3300, short: 2550 });
	});

	it("never reaches zero for a tiny or degenerate page", () => {
		expect(pixelBudget(0, 0, 150)).toEqual({ long: 1, short: 1 });
	});
});

describe("fitToBudget", () => {
	const budget = { long: 1650, short: 1275 };

	it("keeps an image that already fits", () => {
		expect(fitToBudget(800, 600, budget)).toEqual({
			width: 800,
			height: 600,
			scaled: false,
		});
	});

	it("never upscales", () => {
		expect(fitToBudget(10, 10, budget).scaled).toBe(false);
	});

	it("shrinks to the tighter side and keeps the aspect ratio", () => {
		// 2000 x 1500: long side 1650 / 2000 = 0.825, short side 1275 / 1500 = 0.85.
		expect(fitToBudget(2000, 1500, budget)).toEqual({
			width: 1650,
			height: 1238,
			scaled: true,
		});
		// 1000 x 3000 is limited by its long side: 1650 / 3000 = 0.55.
		expect(fitToBudget(1000, 3000, budget)).toEqual({
			width: 550,
			height: 1650,
			scaled: true,
		});
	});

	it("gives a turned image the same scale as an upright one", () => {
		const upright = fitToBudget(1500, 2000, budget);
		const turned = fitToBudget(2000, 1500, budget);

		expect([turned.width, turned.height]).toEqual([
			upright.height,
			upright.width,
		]);
	});

	it("never produces a zero side", () => {
		expect(fitToBudget(100_000, 1, { long: 10, short: 10 }).height).toBe(1);
	});
});

describe("widestBudget", () => {
	it("takes the larger budget on each side", () => {
		expect(
			widestBudget({ long: 1100, short: 800 }, { long: 900, short: 850 }),
		).toEqual({ long: 1100, short: 850 });
	});
});

describe("keep only if smaller", () => {
	it("accepts strictly fewer bytes", () => {
		expect(isSmaller(1000, 999)).toBe(true);
		expect(isSmaller(1000, 1000)).toBe(false);
		expect(isSmaller(1000, 1001)).toBe(false);
	});

	it("reports the saving as a whole percent", () => {
		expect(percentSaved(1000, 250)).toBe(75);
		expect(percentSaved(1000, 996)).toBe(0);
		expect(percentSaved(0, 0)).toBe(0);
	});
});

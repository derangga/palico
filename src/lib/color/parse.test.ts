import { describe, expect, it } from "vitest";

import { formatColor, toHsl } from "./format.ts";
import type { Rgb } from "./oklab.ts";
import { hslToRgb, isShortHex, parseColor } from "./parse.ts";

const RED: Rgb = { r: 255, g: 0, b: 0 };

// A spread across the hues, the grays, and the dark and light ends.
const COLORS: ReadonlyArray<Rgb> = [
	{ r: 0, g: 0, b: 0 },
	{ r: 255, g: 255, b: 255 },
	{ r: 128, g: 128, b: 128 },
	RED,
	{ r: 0, g: 255, b: 0 },
	{ r: 0, g: 0, b: 255 },
	{ r: 136, g: 57, b: 239 },
	{ r: 254, g: 100, b: 11 },
	{ r: 4, g: 165, b: 229 },
	{ r: 223, g: 142, b: 29 },
	{ r: 30, g: 30, b: 46 },
	{ r: 205, g: 214, b: 244 },
];

describe("parseColor: hex", () => {
	it("reads six digits with or without the hash, in either case", () => {
		expect(parseColor("#8839ef")).toEqual({ r: 136, g: 57, b: 239 });
		expect(parseColor("8839EF")).toEqual({ r: 136, g: 57, b: 239 });
	});

	it("repeats each digit of the short form", () => {
		expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0 });
	});

	it("drops the alpha digits", () => {
		expect(parseColor("#ff000080")).toEqual(RED);
		expect(parseColor("#f008")).toEqual(RED);
	});

	it("ignores spaces around the value", () => {
		expect(parseColor("  #ff0000\n")).toEqual(RED);
	});
});

describe("parseColor: rgb", () => {
	it("reads commas, spaces and percentages", () => {
		expect(parseColor("rgb(255, 0, 0)")).toEqual(RED);
		expect(parseColor("rgb(255 0 0)")).toEqual(RED);
		expect(parseColor("RGB(100%, 0%, 0%)")).toEqual(RED);
	});

	it("rounds a percentage to a whole channel", () => {
		expect(parseColor("rgb(50% 50% 50%)")).toEqual({ r: 128, g: 128, b: 128 });
	});

	it("clamps channels the way CSS does", () => {
		expect(parseColor("rgb(300, -5, 0)")).toEqual(RED);
	});

	it("reads and drops alpha in both syntaxes", () => {
		expect(parseColor("rgb(255 0 0 / 50%)")).toEqual(RED);
		expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual(RED);
	});
});

describe("parseColor: hsl", () => {
	it("reads the pure hues", () => {
		expect(parseColor("hsl(0, 100%, 50%)")).toEqual(RED);
		expect(parseColor("hsl(120 100% 50%)")).toEqual({ r: 0, g: 255, b: 0 });
		expect(parseColor("hsl(240deg 100% 50%)")).toEqual({ r: 0, g: 0, b: 255 });
	});

	it("reads other hue units", () => {
		expect(parseColor("hsl(0.5turn 100% 50%)")).toEqual({
			r: 0,
			g: 255,
			b: 255,
		});

		expect(parseColor("hsl(200grad 100% 50%)")).toEqual({
			r: 0,
			g: 255,
			b: 255,
		});
	});

	it("reads a hue in radians", () => {
		expect(parseColor("hsl(3.141592653589793rad 100% 50%)")).toEqual({
			r: 0,
			g: 255,
			b: 255,
		});
	});

	it("wraps a hue past a full turn, and a negative one", () => {
		expect(parseColor("hsl(360, 100%, 50%)")).toEqual(RED);
		expect(parseColor("hsl(-120, 100%, 50%)")).toEqual({ r: 0, g: 0, b: 255 });
	});

	it("takes a bare number for saturation and lightness", () => {
		expect(parseColor("hsl(0 100 50)")).toEqual(RED);
	});

	it("clamps saturation and lightness", () => {
		expect(parseColor("hsl(0, 150%, 50%)")).toEqual(RED);
		expect(parseColor("hsl(0, 100%, 120%)")).toEqual({
			r: 255,
			g: 255,
			b: 255,
		});
	});
});

describe("parseColor: oklch", () => {
	it("reads lightness as a number or a percentage", () => {
		expect(parseColor("oklch(0.628 0.258 29.2)")).toEqual(RED);
		expect(parseColor("oklch(62.8% 0.258 29.2)")).toEqual(RED);
	});

	it("reads chroma as a percentage of 0.4", () => {
		expect(parseColor("oklch(0.628 64.5% 29.2)")).toEqual(
			parseColor("oklch(0.628 0.258 29.2)"),
		);
	});

	it("reads white and black", () => {
		expect(parseColor("oklch(1 0 0)")).toEqual({ r: 255, g: 255, b: 255 });
		expect(parseColor("oklch(0 0 0)")).toEqual({ r: 0, g: 0, b: 0 });
	});

	it("clamps a color outside sRGB channel by channel", () => {
		// Far more chroma than green has: red and blue go below zero and clamp to 0.
		expect(parseColor("oklch(0.7 0.4 150)")).toEqual({ r: 0, g: 214, b: 0 });
	});

	it("drops alpha", () => {
		expect(parseColor("oklch(0.628 0.258 29.2 / 0.5)")).toEqual(RED);
	});
});

describe("parseColor: separators and alpha", () => {
	it("refuses an empty field between commas", () => {
		expect(parseColor("rgb(1,,2,3)")).toBeUndefined();
		expect(parseColor("rgb(1, , 2, 3)")).toBeUndefined();
	});

	it("takes a fourth value as alpha only in the comma form", () => {
		expect(parseColor("rgba(255, 0, 0, 0.5)")).toEqual(RED);
		expect(parseColor("rgb(255 0 0 0.5)")).toBeUndefined();
		expect(parseColor("hsl(1 2 3 4)")).toBeUndefined();
	});

	it("refuses an alpha with a unit that is not a percent", () => {
		expect(parseColor("rgba(255, 0, 0, 5deg)")).toBeUndefined();
		expect(parseColor("rgb(255 0 0 / 5deg)")).toBeUndefined();
	});
});

describe("parseColor: numbers too big to be numbers", () => {
	const HUGE = "9".repeat(400);

	it.each([
		`hsl(${HUGE} 50% 50%)`,
		`hsl(${HUGE}turn 50% 50%)`,
		`oklch(0.5 0.1 ${HUGE})`,
		`oklch(0.5 ${HUGE} 0)`,
		`oklch(0.5 ${HUGE}% 90)`,
		`rgb(${HUGE} 0 0)`,
	])("refuses %#, so no channel is ever NaN", (text) => {
		expect(parseColor(text)).toBeUndefined();
	});
});

describe("isShortHex", () => {
	it("is true for three and four digits, with or without the hash", () => {
		expect(isShortHex("#883")).toBe(true);
		expect(isShortHex("8839")).toBe(true);
		expect(isShortHex("  #FFF ")).toBe(true);
	});

	it("is false for anything else", () => {
		expect(isShortHex("#88")).toBe(false);
		expect(isShortHex("#88399")).toBe(false);
		expect(isShortHex("#8839ef")).toBe(false);
		expect(isShortHex("rgb(1 2 3)")).toBe(false);
	});
});

describe("parseColor: the formatters' own output", () => {
	it("reads every color formatColor writes in hex and rgb exactly", () => {
		for (const color of COLORS) {
			expect(parseColor(formatColor(color, "hex"))).toEqual(color);
			expect(parseColor(formatColor(color, "rgb"))).toEqual(color);
		}
	});

	// HSL is written in whole degrees and percents, and OKLCH to three digits,
	// so a round trip can land a step or two away. It must never land further.
	it("reads HSL back within 3 steps per channel", () => {
		for (const color of COLORS) {
			const back = parseColor(formatColor(color, "hsl"));

			expect(back).toBeDefined();
			expect(Math.abs((back?.r ?? 0) - color.r)).toBeLessThanOrEqual(3);
			expect(Math.abs((back?.g ?? 0) - color.g)).toBeLessThanOrEqual(3);
			expect(Math.abs((back?.b ?? 0) - color.b)).toBeLessThanOrEqual(3);
		}
	});

	it("reads OKLCH back within 2 steps per channel", () => {
		for (const color of COLORS) {
			const back = parseColor(formatColor(color, "oklch"));

			expect(back).toBeDefined();
			expect(Math.abs((back?.r ?? 0) - color.r)).toBeLessThanOrEqual(2);
			expect(Math.abs((back?.g ?? 0) - color.g)).toBeLessThanOrEqual(2);
			expect(Math.abs((back?.b ?? 0) - color.b)).toBeLessThanOrEqual(2);
		}
	});
});

describe("parseColor: refusals", () => {
	it.each([
		"",
		"   ",
		"red",
		"#12",
		"#12345",
		"#1234567",
		"#ggg",
		"rgb(1, 2)",
		"rgb(1, 2, 3, 4, 5)",
		"rgb(1, 2, x)",
		"rgb(none 0 0)",
		"rgb(1 2 3",
		"rgb(1 2 3) extra",
		"rgb(1px 2 3)",
		"rgb(1 2 3 / 4 / 5)",
		"rgb(1 2 3 / )",
		"hsl(abc, 50%, 50%)",
		"hsl(0, 50px, 50%)",
		"oklch(0.5 0.1)",
		"oklch(0.5 0.1 90, 0.5)",
		"oklch(0.5 0.1 90xyz)",
		"lab(50 20 30)",
	])("refuses %j", (text) => {
		expect(parseColor(text)).toBeUndefined();
	});
});

describe("hslToRgb", () => {
	it("maps the primaries", () => {
		expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual(RED);
		expect(hslToRgb({ h: 60, s: 100, l: 50 })).toEqual({
			r: 255,
			g: 255,
			b: 0,
		});
	});

	it("maps zero saturation to gray", () => {
		expect(hslToRgb({ h: 200, s: 0, l: 50 })).toEqual({
			r: 128,
			g: 128,
			b: 128,
		});
	});

	it("maps the lightness ends to black and white", () => {
		expect(hslToRgb({ h: 200, s: 80, l: 0 })).toEqual({ r: 0, g: 0, b: 0 });
		expect(hslToRgb({ h: 200, s: 80, l: 100 })).toEqual({
			r: 255,
			g: 255,
			b: 255,
		});
	});

	it("undoes toHsl to within a step or two", () => {
		for (const color of COLORS) {
			const back = hslToRgb(toHsl(color));

			expect(Math.abs(back.r - color.r)).toBeLessThanOrEqual(3);
			expect(Math.abs(back.g - color.g)).toBeLessThanOrEqual(3);
			expect(Math.abs(back.b - color.b)).toBeLessThanOrEqual(3);
		}
	});
});

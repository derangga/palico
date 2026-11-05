import { describe, expect, it } from "vitest";

import {
	formatColor,
	toCssVariables,
	toHex,
	toHsl,
	toHslString,
	toOklchString,
	toRgbString,
} from "./format.ts";

const tomato = { r: 255, g: 99, b: 71 };
const red = { r: 255, g: 0, b: 0 };

describe("toHex", () => {
	it("writes lowercase, zero-padded hex", () => {
		expect(toHex(tomato)).toBe("#ff6347");
		expect(toHex({ r: 0, g: 5, b: 10 })).toBe("#00050a");
	});
});

describe("toRgbString", () => {
	it("writes comma-separated channels", () => {
		expect(toRgbString(tomato)).toBe("rgb(255, 99, 71)");
	});
});

describe("toHsl", () => {
	it("matches the CSS named color tomato", () => {
		expect(toHsl(tomato)).toEqual({ h: 9, s: 100, l: 64 });
	});

	it("handles each hue sector", () => {
		expect(toHsl(red)).toEqual({ h: 0, s: 100, l: 50 });
		expect(toHsl({ r: 0, g: 128, b: 0 })).toEqual({ h: 120, s: 100, l: 25 });
		expect(toHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
	});

	it("keeps hue positive when red is the top channel and blue beats green", () => {
		expect(toHsl({ r: 255, g: 0, b: 128 }).h).toBe(330);
	});

	it("wraps a hue that rounds up to 360 back to 0", () => {
		// The exact hue is 359.76 degrees.
		expect(toHslString({ r: 255, g: 0, b: 1 })).toBe("hsl(0, 100%, 50%)");
	});

	it("gives a gray no hue and no saturation", () => {
		expect(toHsl({ r: 128, g: 128, b: 128 })).toEqual({ h: 0, s: 0, l: 50 });
	});
});

describe("toHslString", () => {
	it("writes whole numbers with percent signs", () => {
		expect(toHslString(tomato)).toBe("hsl(9, 100%, 64%)");
	});
});

describe("toOklchString", () => {
	it("writes lightness, chroma and hue", () => {
		expect(toOklchString(red)).toBe("oklch(0.628 0.258 29.2)");
	});

	it("wraps a hue that rounds up to 360.0 back to 0.0", () => {
		// The exact hue is 359.976 degrees.
		expect(toOklchString({ r: 255, g: 0, b: 136 })).toMatch(/ 0\.0\)$/);
	});

	it("writes a zero hue for a gray", () => {
		expect(toOklchString({ r: 128, g: 128, b: 128 })).toMatch(
			/^oklch\(0\.\d{3} 0\.000 0\.0\)$/,
		);
	});
});

describe("formatColor", () => {
	it("picks the formatter by name", () => {
		expect(formatColor(tomato, "hex")).toBe("#ff6347");
		expect(formatColor(tomato, "rgb")).toBe("rgb(255, 99, 71)");
		expect(formatColor(tomato, "hsl")).toBe("hsl(9, 100%, 64%)");
		expect(formatColor(tomato, "oklch")).toMatch(/^oklch\(/);
	});
});

describe("toCssVariables", () => {
	it("writes one numbered custom property per color", () => {
		expect(toCssVariables([tomato, red], "hex")).toBe(
			":root {\n  --palette-1: #ff6347;\n  --palette-2: #ff0000;\n}",
		);
	});
});

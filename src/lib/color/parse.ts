// Reads a color someone typed or pasted: HEX, rgb(), hsl() or oklch().
// The reverse of format.ts. Alpha is read and dropped, because the picker works
// with opaque colors. Pure functions, so tests cover every accepted form.

import { clampChannel, oklabToRgb, oklchToOklab, type Rgb } from "./oklab.ts";

export interface Hsl {
	/** Degrees. Any value is accepted and wrapped into 0 to 360. */
	readonly h: number;
	/** 0 to 100. */
	readonly s: number;
	/** 0 to 100. */
	readonly l: number;
}

/** The inverse of `toHsl` in format.ts. Out-of-range saturation and lightness are clamped. */
export function hslToRgb({ h, s, l }: Hsl): Rgb {
	const saturation = Math.min(100, Math.max(0, s)) / 100;
	const lightness = Math.min(100, Math.max(0, l)) / 100;
	const hue = ((h % 360) + 360) % 360;
	const chroma = saturation * Math.min(lightness, 1 - lightness);

	const channel = (offset: number): number => {
		const k = (offset + hue / 30) % 12;

		return clampChannel(
			(lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255,
		);
	};

	return { r: channel(0), g: channel(8), b: channel(4) };
}

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/i;
const TOKEN = /^([+-]?(?:\d+\.?\d*|\.\d+))(%|deg|grad|rad|turn)?$/i;

interface Token {
	readonly value: number;
	/** Lowercase, "" when the number had no unit. */
	readonly unit: string;
}

function readToken(text: string): Token | undefined {
	const match = TOKEN.exec(text);

	if (!match?.[1]) return undefined;

	const value = Number(match[1]);

	// A run of 400 digits is a valid token and an infinite number.
	if (!Number.isFinite(value)) return undefined;

	return { value, unit: (match[2] ?? "").toLowerCase() };
}

const DEGREES_PER_UNIT = new Map<string, number>([
	["", 1],
	["deg", 1],
	["grad", 0.9],
	["rad", 180 / Math.PI],
	["turn", 360],
]);

const hueOf = ({ value, unit }: Token): number | undefined => {
	const scale = DEGREES_PER_UNIT.get(unit);

	return scale === undefined ? undefined : value * scale;
};

// A bare number is taken as is; a percentage is that share of `full`.
const scaled = ({ value, unit }: Token, full: number): number | undefined => {
	if (unit === "") return value;

	return unit === "%" ? (value / 100) * full : undefined;
};

const isAlpha = (token: Token | undefined): boolean =>
	token !== undefined && (token.unit === "" || token.unit === "%");

/**
 * True for text that is a complete 3 or 4 digit hex color, which is also the
 * start of a 6 or 8 digit one. The box applies these only once it is settled.
 */
export const isShortHex = (text: string): boolean =>
	/^#?[0-9a-f]{3,4}$/i.test(text.trim());

function parseHex(digits: string): Rgb {
	// #rgb and #rgba repeat each digit; the alpha digits are dropped.
	const full =
		digits.length <= 4
			? [...digits].map((digit) => digit + digit).join("")
			: digits;

	return {
		r: Number.parseInt(full.slice(0, 2), 16),
		g: Number.parseInt(full.slice(2, 4), 16),
		b: Number.parseInt(full.slice(4, 6), 16),
	};
}

function rgbFrom([red, green, blue]: ReadonlyArray<Token>): Rgb | undefined {
	if (!red || !green || !blue) return undefined;

	const r = scaled(red, 255);
	const g = scaled(green, 255);
	const b = scaled(blue, 255);

	return r === undefined || g === undefined || b === undefined
		? undefined
		: { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b) };
}

function hslFrom([hue, saturation, lightness]: ReadonlyArray<Token>):
	| Rgb
	| undefined {
	if (!hue || !saturation || !lightness) return undefined;

	const h = hueOf(hue);
	const s = scaled(saturation, 100);
	const l = scaled(lightness, 100);

	return h === undefined || s === undefined || l === undefined
		? undefined
		: hslToRgb({ h, s, l });
}

function oklchFrom([lightness, chroma, hue]: ReadonlyArray<Token>):
	| Rgb
	| undefined {
	if (!lightness || !chroma || !hue) return undefined;

	const h = hueOf(hue);
	// Lightness is 0 to 1 or a percentage. Chroma is a plain number, or a
	// percentage where 100% is 0.4, as in CSS.
	const L = scaled(lightness, 1);
	const C = scaled(chroma, 0.4);

	if (h === undefined || L === undefined || C === undefined) return undefined;

	// A color outside sRGB is clamped channel by channel by `oklabToRgb`.
	return oklabToRgb(
		oklchToOklab({
			L: Math.min(1, Math.max(0, L)),
			C: Math.max(0, C),
			h,
		}),
	);
}

function parseFunction(name: string, body: string): Rgb | undefined {
	const [main = "", alpha, ...rest] = body.split("/");

	// Anything after the slash is an alpha value. It must still be a number.
	if (rest.length > 0) return undefined;

	if (alpha !== undefined && !isAlpha(readToken(alpha.trim()))) {
		return undefined;
	}

	// One comma or run of spaces between values. Two commas in a row leave an
	// empty word, which is not a number.
	const words = main.trim().split(/\s*,\s*|\s+/);

	const tokens = words.flatMap((word) => {
		const token = readToken(word);

		return token ? [token] : [];
	});

	// A word that is not a number ("none", "abc") invalidates the whole color.
	if (tokens.length !== words.length) return undefined;

	// The comma form may carry alpha as a fourth value: rgba(1, 2, 3, 0.5).
	const fourthIsAlpha =
		tokens.length === 4 &&
		alpha === undefined &&
		name !== "oklch" &&
		main.includes(",") &&
		isAlpha(tokens[3]);

	if (tokens.length !== 3 && !fourthIsAlpha) return undefined;

	if (name.startsWith("rgb")) return rgbFrom(tokens);

	if (name.startsWith("hsl")) return hslFrom(tokens);

	return oklchFrom(tokens);
}

/** The color in `text`, or undefined when it is not a color this reads. */
export function parseColor(text: string): Rgb | undefined {
	const trimmed = text.trim();
	const hex = HEX.exec(trimmed);

	if (hex?.[1]) return parseHex(hex[1]);

	const call = FUNCTION.exec(trimmed);

	if (!call?.[1] || call[2] === undefined) return undefined;

	return parseFunction(call[1].toLowerCase(), call[2]);
}

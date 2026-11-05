// Turns a color into the strings people paste into CSS and design tools.
// Pure functions, so tests cover every format.

import { oklabToOklch, type Rgb, rgbToOklab } from "./oklab.ts";

export type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

export const COLOR_FORMATS: ReadonlyArray<{
	readonly value: ColorFormat;
	readonly label: string;
}> = [
	{ value: "hex", label: "HEX" },
	{ value: "rgb", label: "RGB" },
	{ value: "hsl", label: "HSL" },
	{ value: "oklch", label: "OKLCH" },
];

const pair = (channel: number): string => channel.toString(16).padStart(2, "0");

export const toHex = ({ r, g, b }: Rgb): string =>
	`#${pair(r)}${pair(g)}${pair(b)}`;

export const toRgbString = ({ r, g, b }: Rgb): string =>
	`rgb(${r}, ${g}, ${b})`;

export function toHsl({ r, g, b }: Rgb) {
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const delta = max - min;
	const lightness = (max + min) / 2;

	if (delta === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) };

	const saturation = delta / (1 - Math.abs(2 * lightness - 1));
	let hue: number;

	if (max === red) hue = ((green - blue) / delta) % 6;
	else if (max === green) hue = (blue - red) / delta + 2;
	else hue = (red - green) / delta + 4;

	return {
		// Round before wrapping, so a hue of 359.8 reads as 0 and never as 360.
		h: Math.round(hue * 60 + 360) % 360,
		s: Math.round(saturation * 100),
		l: Math.round(lightness * 100),
	};
}

export function toHslString(rgb: Rgb): string {
	const { h, s, l } = toHsl(rgb);

	return `hsl(${h}, ${s}%, ${l}%)`;
}

export function toOklchString(rgb: Rgb): string {
	const { L, C, h } = oklabToOklch(rgbToOklab(rgb));
	// Same wrap as HSL: a hue that rounds to 360.0 is written as 0.0.
	const hue = Number(h.toFixed(1)) % 360;

	return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(1)})`;
}

const FORMATTERS: Record<ColorFormat, (rgb: Rgb) => string> = {
	hex: toHex,
	rgb: toRgbString,
	hsl: toHslString,
	oklch: toOklchString,
};

export const formatColor = (rgb: Rgb, format: ColorFormat): string =>
	FORMATTERS[format](rgb);

/** A `:root` block with one custom property per color, in the chosen format. */
export const toCssVariables = (
	colors: ReadonlyArray<Rgb>,
	format: ColorFormat,
): string =>
	[
		":root {",
		...colors.map(
			(color, index) =>
				`  --palette-${index + 1}: ${formatColor(color, format)};`,
		),
		"}",
	].join("\n");

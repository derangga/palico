// sRGB <-> OKLab, after Bjorn Ottosson's reference (https://bottosson.github.io/posts/oklab/).
// OKLab is perceptually even: equal distances look like equal color changes,
// which is what clustering pixels into a palette needs. Pure functions.

export interface Rgb {
	/** Each channel is 0 to 255. */
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

export interface Oklab {
	/** Lightness, 0 (black) to 1 (white). */
	readonly L: number;
	readonly a: number;
	readonly b: number;
}

export interface Oklch {
	readonly L: number;
	/** Chroma. 0 is gray; sRGB tops out near 0.32. */
	readonly C: number;
	/** Hue in degrees, 0 to 360. 0 when the color is gray. */
	readonly h: number;
}

const toLinear = (channel: number): number => {
	const value = channel / 255;

	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (value: number): number => {
	const encoded =
		value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;

	return encoded * 255;
};

export const clampChannel = (value: number): number =>
	Math.min(255, Math.max(0, Math.round(value)));

export function rgbToOklab({ r, g, b }: Rgb): Oklab {
	const lr = toLinear(r);
	const lg = toLinear(g);
	const lb = toLinear(b);

	const l = Math.cbrt(
		0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
	);

	const m = Math.cbrt(
		0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
	);

	const s = Math.cbrt(
		0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
	);

	return {
		L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	};
}

/** Rounds to whole channels and clamps, because an averaged color can sit just outside sRGB. */
export function oklabToRgb({ L, a, b }: Oklab): Rgb {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

	return {
		r: clampChannel(
			fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		),
		g: clampChannel(
			fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		),
		b: clampChannel(
			fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
		),
	};
}

// Below this chroma the hue is rounding noise, so the color counts as gray.
const GRAY_CHROMA = 0.0004;

export function oklabToOklch({ L, a, b }: Oklab): Oklch {
	const C = Math.hypot(a, b);

	if (C < GRAY_CHROMA) return { L, C, h: 0 };

	const degrees = (Math.atan2(b, a) * 180) / Math.PI;

	return { L, C, h: degrees < 0 ? degrees + 360 : degrees };
}

/** The inverse of `oklabToOklch`. The hue is in degrees. */
export function oklchToOklab({ L, C, h }: Oklch): Oklab {
	const radians = (h * Math.PI) / 180;

	return { L, a: C * Math.cos(radians), b: C * Math.sin(radians) };
}

/** Straight-line distance in OKLab. About 0.02 is the smallest difference people notice. */
export const oklabDistance = (x: Oklab, y: Oklab): number =>
	Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);

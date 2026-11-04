// What a person needs to know to make a code that scans: how much fits, how
// dense the result is, and what will make scanners struggle. Pure functions,
// so the page can recompute them on every keystroke.

import { classify } from "./encode.ts";
import {
	type EccLevel,
	maxCharacters,
	MAX_VERSION,
	type QrMode,
	sizeOfVersion,
	smallestVersion,
} from "./tables.ts";

export const QUIET_ZONE_MODULES = 4;

export interface EccOption {
	readonly level: EccLevel;
	readonly label: string;
	/** Share of the code that can be damaged and still read. */
	readonly recovers: string;
	readonly hint: string;
}

export const ECC_OPTIONS: ReadonlyArray<EccOption> = [
	{
		level: "L",
		label: "Low",
		recovers: "7%",
		hint: "Smallest code. For clean screens.",
	},
	{
		level: "M",
		label: "Medium",
		recovers: "15%",
		hint: "A good default for most uses.",
	},
	{
		level: "Q",
		label: "Quartile",
		recovers: "25%",
		hint: "For print that may get scuffed.",
	},
	{
		level: "H",
		label: "High",
		recovers: "30%",
		hint: "Biggest code. Survives the most damage.",
	},
];

export type Density = "light" | "medium" | "dense";

export interface Plan {
	readonly mode: QrMode;
	/** Characters (digits, letters) or bytes, depending on the mode. */
	readonly length: number;
	/** Undefined when the text does not fit in any version. */
	readonly version: number | undefined;
	/** Modules per side without the quiet zone. */
	readonly modules: number | undefined;
	/** The most this mode holds at this level, in the same unit as `length`. */
	readonly limit: number;
	readonly unit: "digits" | "characters" | "bytes";
	readonly density: Density | undefined;
}

const UNITS: Record<QrMode, Plan["unit"]> = {
	numeric: "digits",
	alphanumeric: "characters",
	byte: "bytes",
};

export function densityOf(version: number): Density {
	if (version <= 5) return "light";

	return version <= 12 ? "medium" : "dense";
}

export function planFor(text: string, ecc: EccLevel): Plan {
	const payload = classify(text);
	const version = smallestVersion(payload.mode, payload.length, ecc);

	return {
		mode: payload.mode,
		length: payload.length,
		version,
		modules: version === undefined ? undefined : sizeOfVersion(version),
		limit: maxCharacters(payload.mode, MAX_VERSION, ecc),
		unit: UNITS[payload.mode],
		density: version === undefined ? undefined : densityOf(version),
	};
}

/** Smallest printed width, in centimetres, that keeps each module about 0.4 mm. */
export function minPrintWidthCm(modules: number): number {
	const total = modules + QUIET_ZONE_MODULES * 2;

	return Math.max(1.5, Math.ceil(total * 0.04 * 2) / 2);
}

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: string): boolean => HEX.test(value);

function luminance(hex: string): number {
	const channel = (offset: number) => {
		const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;

		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	};

	return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio, 1 to 21. Undefined if either color is not #rrggbb. */
export function contrastRatio(a: string, b: string): number | undefined {
	if (!isHexColor(a) || !isHexColor(b)) return undefined;

	const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);

	return (bright! + 0.05) / (dark! + 0.05);
}

export type AdviceKind =
	| "too-long"
	| "contrast"
	| "inverted"
	| "bare-link"
	| "dense";

export interface Advice {
	readonly kind: AdviceKind;
	readonly severity: "error" | "warning" | "tip";
	readonly message: string;
}

// A domain or path without a scheme: phones read it as plain text, not a link.
const BARE_LINK = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i;

export interface AdviceInput {
	readonly text: string;
	readonly ecc: EccLevel;
	readonly foreground: string;
	readonly background: string;
}

export function adviseOn(input: AdviceInput): Advice[] {
	const { text, ecc, foreground, background } = input;
	const advice: Advice[] = [];
	const plan = planFor(text, ecc);

	if (text.length > 0 && plan.version === undefined) {
		advice.push({
			kind: "too-long",
			severity: "error",
			message: `This is ${plan.length.toLocaleString("en-US")} ${plan.unit}, and a code holds at most ${plan.limit.toLocaleString("en-US")} at this level. Shorten the text, or use a lower error correction level.`,
		});
	}

	const ratio = contrastRatio(foreground, background);

	if (ratio !== undefined) {
		if (ratio < 3) {
			advice.push({
				kind: "contrast",
				severity: "warning",
				message: `These colors are too close (${ratio.toFixed(1)}:1). Many scanners will fail. Aim for 4:1 or more.`,
			});
		} else if (luminance(foreground) > luminance(background)) {
			advice.push({
				kind: "inverted",
				severity: "warning",
				message:
					"Light modules on a dark background. Some scanners can't read inverted codes, so test yours.",
			});
		}
	}

	if (BARE_LINK.test(text.trim())) {
		advice.push({
			kind: "bare-link",
			severity: "tip",
			message: "Start the address with https:// so phones open it as a link.",
		});
	}

	if (plan.modules !== undefined && plan.density === "dense") {
		advice.push({
			kind: "dense",
			severity: "tip",
			message: `This code is dense. Print it at least ${minPrintWidthCm(plan.modules)} cm wide, or shorten the text (a short link helps) for a code that is easier to scan.`,
		});
	}

	return advice;
}

export interface Tip {
	readonly title: string;
	readonly body: string;
}

/** The static checklist shown under the generator. */
export const SCAN_TIPS: ReadonlyArray<Tip> = [
	{
		title: "Leave a clear margin",
		body: "Keep the white border around the code, at least 4 modules wide. Scanners use it to find the edges.",
	},
	{
		title: "Use dark on light",
		body: "Dark modules on a light background scan best. Keep the contrast at 4:1 or higher, and avoid inverting the colors.",
	},
	{
		title: "Print big enough",
		body: "Aim for at least 2 cm across for a short link. Dense codes need more. Scan distance should be no more than about ten times the code's width.",
	},
	{
		title: "Keep the text short",
		body: "Less data means bigger modules and a code that scans from further away. A short link beats a long one.",
	},
	{
		title: "Pick the right correction level",
		body: "Medium suits most uses. Choose Quartile or High if the code will be printed on something that gets worn, or if you'll place a sticker on it. Higher levels make the code larger.",
	},
	{
		title: "Test before you print",
		body: "Scan it with two different phones, from the distance people will use, before you print a thousand of them.",
	},
];

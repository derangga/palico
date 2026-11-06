// What a person needs to know to make a code that scans: how much fits, how
// dense the result is, and what will make scanners struggle. Pure functions,
// so the page can recompute them on every keystroke.

import { formatDecimal } from "#/lib/format-bytes.ts";
import { currentLocale } from "#/lib/i18n/state.ts";
import { m } from "#/paraglide/messages.js";

import { classify } from "./encode.ts";
import {
	type EccLevel,
	maxCharacters,
	MAX_VERSION,
	MODE_UNIT,
	type QrMode,
	sizeOfVersion,
	smallestVersion,
} from "./tables.ts";
import { unitLabel } from "./units.ts";

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
		get label() {
			return m.qr_ecc_low();
		},
		recovers: "7%",
		get hint() {
			return m.qr_ecc_low_hint();
		},
	},
	{
		level: "M",
		get label() {
			return m.qr_ecc_medium();
		},
		recovers: "15%",
		get hint() {
			return m.qr_ecc_medium_hint();
		},
	},
	{
		level: "Q",
		get label() {
			return m.qr_ecc_quartile();
		},
		recovers: "25%",
		get hint() {
			return m.qr_ecc_quartile_hint();
		},
	},
	{
		level: "H",
		get label() {
			return m.qr_ecc_high();
		},
		recovers: "30%",
		get hint() {
			return m.qr_ecc_high_hint();
		},
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
		unit: MODE_UNIT[payload.mode],
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
// The last label must be letters (so "3.14" is not a link), and common file
// extensions are excluded (so "notes.txt" is not either).
const BARE_LINK = /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,})(\/\S*)?$/i;

const FILE_EXTENSIONS = new Set([
	"txt",
	"md",
	"pdf",
	"doc",
	"docx",
	"csv",
	"png",
	"jpg",
	"jpeg",
	"gif",
	"zip",
	"json",
	"html",
]);

function looksLikeBareLink(text: string): boolean {
	const match = BARE_LINK.exec(text);

	if (!match) return false;

	// A path after the domain means it is a link even if the domain ends like a file.
	return (
		match[4] !== undefined || !FILE_EXTENSIONS.has(match[3]!.toLowerCase())
	);
}

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
			// No live count here: this text sits in an alert region, and a changing
			// number would be announced again on every keystroke.
			message: m.qr_advice_too_long({
				limit: plan.limit.toLocaleString(currentLocale()),
				unit: unitLabel(plan.unit),
			}),
		});
	}

	const ratio = contrastRatio(foreground, background);

	if (ratio !== undefined) {
		if (ratio < 3) {
			advice.push({
				kind: "contrast",
				severity: "warning",
				message: m.qr_advice_contrast({ ratio: formatDecimal(ratio, 1) }),
			});
		} else if (luminance(foreground) > luminance(background)) {
			advice.push({
				kind: "inverted",
				severity: "warning",
				message: m.qr_advice_inverted(),
			});
		}
	}

	if (looksLikeBareLink(text.trim())) {
		advice.push({
			kind: "bare-link",
			severity: "tip",
			message: m.qr_advice_bare_link(),
		});
	}

	if (plan.modules !== undefined && plan.density === "dense") {
		advice.push({
			kind: "dense",
			severity: "tip",
			message: m.qr_advice_dense({ cm: minPrintWidthCm(plan.modules) }),
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
		get title() {
			return m.qr_tip_margin_title();
		},
		get body() {
			return m.qr_tip_margin_body();
		},
	},
	{
		get title() {
			return m.qr_tip_dark_title();
		},
		get body() {
			return m.qr_tip_dark_body();
		},
	},
	{
		get title() {
			return m.qr_tip_size_title();
		},
		get body() {
			return m.qr_tip_size_body();
		},
	},
	{
		get title() {
			return m.qr_tip_short_title();
		},
		get body() {
			return m.qr_tip_short_body();
		},
	},
	{
		get title() {
			return m.qr_tip_ecc_title();
		},
		get body() {
			return m.qr_tip_ecc_body();
		},
	},
	{
		get title() {
			return m.qr_tip_test_title();
		},
		get body() {
			return m.qr_tip_test_body();
		},
	},
];

// Pure helpers for the PDF compressor. Imported by pdf.worker.ts and the page,
// so this module must stay free of Effect and DOM imports.

export const COMPRESS_PRESET_IDS = ["light", "balanced", "small"] as const;

export type CompressPresetId = (typeof COMPRESS_PRESET_IDS)[number];

export const DEFAULT_COMPRESS_PRESET: CompressPresetId = "balanced";

// What the image pass does. `null` leaves every image byte-for-byte alone.
export interface ImageSettings {
	// Images are shrunk until they hold at most this many pixels per inch of the
	// page they sit on. Never upscaled.
	readonly maxDpi: number;
	// JPEG quality for the re-encode, 0 to 1.
	readonly quality: number;
}

export interface PresetSettings {
	readonly images: ImageSettings | null;
}

// Every preset also runs the lossless pass, so there is no flag for it.
export const PRESETS: Readonly<Record<CompressPresetId, PresetSettings>> = {
	light: { images: null },
	balanced: { images: { maxDpi: 150, quality: 0.75 } },
	small: { images: { maxDpi: 100, quality: 0.6 } },
};

// PDF user space is 72 units per inch.
const POINTS_PER_INCH = 72;

// The pixels an image may fill on a page, by side length. Orientation is left
// out on purpose: a landscape photo on a portrait page, or one placed turned
// by 90 degrees, compares its long side to the page's long side and its short
// side to the short one. v1 shortcut: the page is the whole box. The content
// stream's real placement is not read, so an image drawn at half the page is
// still kept at page size.
export interface PixelBudget {
	readonly long: number;
	readonly short: number;
}

// `userUnit` is the page's /UserUnit (1 when absent): one user space unit is
// 1/72 inch times that.
export const pixelBudget = (
	pageWidthPt: number,
	pageHeightPt: number,
	dpi: number,
	userUnit = 1,
): PixelBudget => {
	const toPixels = (points: number) =>
		Math.max(1, Math.floor(((points * userUnit) / POINTS_PER_INCH) * dpi));

	return {
		long: toPixels(Math.max(pageWidthPt, pageHeightPt)),
		short: toPixels(Math.min(pageWidthPt, pageHeightPt)),
	};
};

export interface PixelSize {
	readonly width: number;
	readonly height: number;
}

// The larger budget on each side. An image shared by several pages has to stay
// sharp on the biggest of them.
export const widestBudget = (a: PixelBudget, b: PixelBudget): PixelBudget => ({
	long: Math.max(a.long, b.long),
	short: Math.max(a.short, b.short),
});

// Shrink `width` x `height` to fit `budget`, keeping the aspect ratio. Returns
// the same size when it already fits, since the pass never upscales.
export const fitToBudget = (
	width: number,
	height: number,
	budget: PixelBudget,
): PixelSize & { readonly scaled: boolean } => {
	const scale = Math.min(
		1,
		budget.long / Math.max(width, height),
		budget.short / Math.min(width, height),
	);

	if (scale >= 1) return { width, height, scaled: false };

	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
		scaled: true,
	};
};

// A replacement stream only goes in when it saves bytes.
export const isSmaller = (before: number, after: number): boolean =>
	after < before;

export const percentSaved = (before: number, after: number): number =>
	before <= 0 ? 0 : Math.round((1 - after / before) * 100);

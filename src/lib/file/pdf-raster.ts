// Pure helpers for the PDF to Images tool. Imported by pdf.worker.ts, so this
// module must stay free of Effect and DOM imports.

// iOS Safari refuses canvases over 4096 x 4096 px of area. A page that would
// exceed it at the chosen DPI is scaled down to fit, on its own.
export const MAX_RASTER_PAGE_PIXELS = 4096 * 4096;

// ponytail: total pixel budget caps the in-memory zip; showSaveFilePicker
// streaming to disk lifts it on Chromium. 250 M px fits 100 A4 pages at 150 DPI
// (217 M px) or about 28 at 300 DPI.
export const MAX_RASTER_TOTAL_PIXELS = 250_000_000;

// Same as the image converter's DEFAULT_QUALITY (src/lib/image/types.ts),
// duplicated so the worker does not pull Effect Schema into its bundle.
export const RASTER_JPEG_QUALITY = 0.92;

// PDF user space is 72 units per inch, so `dpi / 72` is the render scale.
// `width` and `height` are the page size at scale 1 (pdf.js viewport, already
// rotated by the page's /Rotate).
export const rasterSize = (
	width: number,
	height: number,
	dpi: number,
): {
	readonly width: number;
	readonly height: number;
	readonly scale: number;
} => {
	let scale = dpi / 72;
	let w = Math.max(1, Math.round(width * scale));
	let h = Math.max(1, Math.round(height * scale));
	if (w * h > MAX_RASTER_PAGE_PIXELS) {
		scale *= Math.sqrt(MAX_RASTER_PAGE_PIXELS / (w * h));
		w = Math.max(1, Math.floor(width * scale));
		h = Math.max(1, Math.floor(height * scale));
	}
	return { width: w, height: h, scale };
};

// "<base>_page_07.png", zero-padded to the page count's width so the zip's
// members sort in page order.
export const memberName = (
	base: string,
	index: number,
	pageCount: number,
	ext: string,
): string =>
	`${base}_page_${String(index + 1).padStart(String(pageCount).length, "0")}.${ext}`;

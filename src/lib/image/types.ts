// Shared constants and types for the client-side image pipeline.
// Used by both the main-thread Effect orchestration and the Web Worker executor.

import { Schema } from "effect";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_DIMENSION = 8000; // px, longest side

// Fixed encode quality for lossy formats (jpg/webp). Not user-configurable —
// the converter's job is format conversion, not quality tuning.
export const DEFAULT_QUALITY = 0.92;

export const OutputFormat = Schema.Literals(["jpeg", "png", "webp"]);

export type OutputFormat = Schema.Schema.Type<typeof OutputFormat>;

export const OUTPUT_FORMATS: ReadonlyArray<{
	value: OutputFormat;
	label: string;
	mime: string;
	ext: string;
	lossy: boolean;
}> = [
	{ value: "jpeg", label: "JPG", mime: "image/jpeg", ext: "jpg", lossy: true },
	{ value: "png", label: "PNG", mime: "image/png", ext: "png", lossy: false },
	{
		value: "webp",
		label: "WebP",
		mime: "image/webp",
		ext: "webp",
		lossy: true,
	},
];

export const formatMeta = (format: OutputFormat) => {
	const meta = OUTPUT_FORMATS.find((f) => f.value === format);

	if (!meta) throw new Error(`Unknown output format: ${format}`);

	return meta;
};

// Swap a file's extension for the target format's extension.
export const outputFileName = (originalName: string, ext: string) => {
	const base = originalName.replace(/\.[^./\\]+$/, "");

	return `${base || "image"}.${ext}`;
};

// Map a source MIME type to a known output format. Only jpg/png/webp can be
// re-encoded reliably by OffscreenCanvas.convertToBlob, so anything else
// (gif, bmp, avif, …) falls back to PNG — used by the resizer to keep the
// source format where possible.
export const sourceFormatMeta = (mime: string) =>
	OUTPUT_FORMATS.find((f) => f.mime === mime) ?? formatMeta("png");

// --- Worker message protocol ---

export const WorkerRequest = Schema.Struct({
	id: Schema.String,
	buffer: Schema.instanceOf(ArrayBuffer),
	sourceType: Schema.String,
	mime: Schema.String,
	quality: Schema.Number,
	maxDimension: Schema.Number,
	// Optional resize target. When omitted, the image is encoded at its source
	// dimensions (converter); when present, it is scaled to these (resizer).
	targetWidth: Schema.optional(Schema.Number),
	targetHeight: Schema.optional(Schema.Number),
	// Compressor only. With targetBytes, `quality` is the ceiling of a search
	// for the highest quality that fits (see quality-search.ts). fillWhite paints
	// a white background first so transparent pixels don't encode as black JPEG.
	targetBytes: Schema.optional(Schema.Number),
	fillWhite: Schema.optional(Schema.Boolean),
});

export type WorkerRequest = Schema.Schema.Type<typeof WorkerRequest>;

export const WorkerResponse = Schema.Union([
	Schema.Struct({
		id: Schema.String,
		ok: Schema.Literal(true),
		buffer: Schema.instanceOf(ArrayBuffer),
		width: Schema.Number,
		height: Schema.Number,
		size: Schema.Number,
		quality: Schema.Number,
		targetMet: Schema.Boolean,
	}),
	Schema.Struct({
		id: Schema.String,
		ok: Schema.Literal(false),
		reason: Schema.Literals(["decode", "dimensions", "encode"]),
		message: Schema.String,
		width: Schema.optional(Schema.Number),
		height: Schema.optional(Schema.Number),
	}),
]);

export type WorkerResponse = Schema.Schema.Type<typeof WorkerResponse>;

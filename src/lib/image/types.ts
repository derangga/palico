// Shared constants and types for the client-side image pipeline.
// Used by both the main-thread Effect orchestration and the Web Worker executor.

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB per file
export const MAX_DIMENSION = 8000; // px, longest side

// Fixed encode quality for lossy formats (jpg/webp). Not user-configurable —
// the converter's job is format conversion, not quality tuning.
export const DEFAULT_QUALITY = 0.92;

export type OutputFormat = "jpeg" | "png" | "webp";

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

// --- Worker message protocol ---

export interface WorkerRequest {
	readonly id: string;
	readonly buffer: ArrayBuffer;
	readonly sourceType: string;
	readonly mime: string;
	readonly quality: number;
	readonly maxDimension: number;
}

export type WorkerResponse =
	| {
			readonly id: string;
			readonly ok: true;
			readonly buffer: ArrayBuffer;
			readonly width: number;
			readonly height: number;
			readonly size: number;
	  }
	| {
			readonly id: string;
			readonly ok: false;
			readonly reason: "decode" | "dimensions" | "encode";
			readonly message: string;
			readonly width?: number;
			readonly height?: number;
	  };

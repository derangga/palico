import type {
	ImageSegmentationPipelineOutput,
	ProgressInfo,
	RawImage,
} from "@huggingface/transformers";
import { Effect, Option, Ref, Schema } from "effect";

import {
	type BackgroundRemovalError,
	DecodeError,
	EncodeError,
	FileTooLargeError,
	InferenceError,
	ModelLoadError,
} from "./errors.ts";
import { MAX_FILE_BYTES } from "./types.ts";

// Single-file ML feature. transformers.js owns its own threading
// (ORT WASM workers / WebGPU), so no wrapping Web Worker. Upgrade if main-thread
// jank shows up on inference.

// transformers.js pipeline instances are callable via a Proxy; type as the
// invocation signature we actually use (a decoded canvas → segmentation output).
// We hand it a canvas rather than a URL so transformers never calls
// createImageBitmap on the blob (see decodeSourceToCanvas).
type SegmentationModel = (
	input: HTMLCanvasElement,
) => Promise<ImageSegmentationPipelineOutput[]>;

export const RemoveProgress = Schema.Union(
	Schema.Struct({
		stage: Schema.Literal("downloading"),
		percent: Schema.Number,
	}),
	Schema.Struct({
		stage: Schema.Literal("processing"),
	}),
);
export type RemoveProgress = Schema.Schema.Type<typeof RemoveProgress>;

// Schema-derived data slice — the callback below can't be schema'd, so the
// input as a whole stays a TS type while `file` rides on the schema.
export const RemoveBackgroundData = Schema.Struct({
	file: Schema.instanceOf(File),
});
export type RemoveBackgroundData = Schema.Schema.Type<
	typeof RemoveBackgroundData
>;

export interface RemoveBackgroundInput extends RemoveBackgroundData {
	readonly onProgress?: (p: RemoveProgress) => void;
}

const MB = 1024 * 1024;
const MODEL_ID = "briaai/RMBG-1.4";

const toModelLoadError = (err: unknown): ModelLoadError =>
	new ModelLoadError({
		message:
			err instanceof Error
				? err.message
				: "Could not load the background removal model.",
	});

const buildPipeline = (
	device: "webgpu" | "wasm",
	onEvent: (e: ProgressInfo) => void,
): Effect.Effect<SegmentationModel, ModelLoadError> =>
	Effect.tryPromise({
		try: async () => {
			const { pipeline, env } = await import("@huggingface/transformers");
			env.allowLocalModels = false;
			// Cache API is unreliable on iOS Safari; rely on browser HTTP cache
			env.useBrowserCache = false;
			const model = await pipeline("image-segmentation", MODEL_ID, {
				device,
				dtype: "fp32",
				progress_callback: onEvent,
			});
			return model as unknown as SegmentationModel;
		},
		catch: toModelLoadError,
	});

// Success-only module memo (no Layer system on the client). Held in a Ref so the
// cache stays inside the Effect graph instead of a mutable `let` — mirrors the
// engine singleton in video/engine.ts. Failures never reach Ref.set, so the user
// can retry by clicking Proceed again.
const modelRef = Ref.unsafeMake<Option.Option<SegmentationModel>>(
	Option.none(),
);

const loadPipeline = (
	onEvent: (e: ProgressInfo) => void,
): Effect.Effect<SegmentationModel, ModelLoadError> =>
	Effect.gen(function* () {
		const cached = yield* Ref.get(modelRef);
		if (Option.isSome(cached)) return cached.value;

		const model = yield* buildPipeline("webgpu", onEvent).pipe(
			Effect.orElse(() => buildPipeline("wasm", onEvent)),
		);
		yield* Ref.set(modelRef, Option.some(model));
		return model;
	});

const validateSize = (file: File): Effect.Effect<void, FileTooLargeError> =>
	file.size > MAX_FILE_BYTES
		? Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(
						MAX_FILE_BYTES / MB,
					)} MB limit.`,
				}),
			)
		: Effect.void;

// Acquire an object URL for the source file; release on success/failure/interrupt.
const useSourceUrl = <A, E>(
	file: File,
	use: (url: string) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
	Effect.acquireUseRelease(
		Effect.sync(() => URL.createObjectURL(file)),
		use,
		(url) => Effect.sync(() => URL.revokeObjectURL(url)),
	);

const loadHtmlImage = (src: string): Promise<HTMLImageElement> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "anonymous";
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error("Could not decode image."));
		img.src = src;
	});

// Decode the source with an <img> element and paint it onto a canvas we then
// feed to the model. transformers.js otherwise fetches the blob URL and runs
// createImageBitmap, which throws "The source image could not be decoded." for
// formats <img> renders fine (SVG, TIFF, some AVIF) — all reachable through the
// route's `image/*` accept. Decoding once here also feeds compositing, so the
// source is never decoded twice.
const decodeSourceToCanvas = (url: string): Promise<HTMLCanvasElement> =>
	loadHtmlImage(url).then((img) => {
		const canvas = document.createElement("canvas");
		canvas.width = img.naturalWidth || img.width;
		canvas.height = img.naturalHeight || img.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Canvas 2D context unavailable.");
		ctx.drawImage(img, 0, 0);
		return canvas;
	});

// Paint the grayscale RawImage mask onto a canvas and return a data URL.
const maskToDataUrl = (mask: RawImage): string => {
	const canvas = document.createElement("canvas");
	canvas.width = mask.width;
	canvas.height = mask.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable.");
	const imageData = ctx.createImageData(mask.width, mask.height);
	const data = mask.data;
	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		imageData.data[i * 4] = v;
		imageData.data[i * 4 + 1] = v;
		imageData.data[i * 4 + 2] = v;
		imageData.data[i * 4 + 3] = 255;
	}
	ctx.putImageData(imageData, 0, 0);
	return canvas.toDataURL();
};

// Composite source RGB (already decoded onto `sourceCanvas`) with mask
// grayscale → alpha and encode as PNG.
const composeCutout = async (
	sourceCanvas: HTMLCanvasElement,
	mask: RawImage,
): Promise<Blob> => {
	const { width, height } = sourceCanvas;
	const ctx = sourceCanvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable.");
	const imageData = ctx.getImageData(0, 0, width, height);

	const maskImg = await loadHtmlImage(maskToDataUrl(mask));
	const maskCanvas = document.createElement("canvas");
	maskCanvas.width = width;
	maskCanvas.height = height;
	const maskCtx = maskCanvas.getContext("2d");
	if (!maskCtx) throw new Error("Canvas 2D context unavailable.");
	maskCtx.drawImage(maskImg, 0, 0, width, height);
	const maskData = maskCtx.getImageData(0, 0, width, height);

	for (let i = 0; i < imageData.data.length; i += 4) {
		imageData.data[i + 3] = maskData.data[i];
	}
	ctx.putImageData(imageData, 0, 0);

	return new Promise<Blob>((resolve, reject) => {
		sourceCanvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG."))),
			"image/png",
		);
	});
};

// transformers.js reports download progress per file, and the model is several
// files: the tiny metadata files (config / preprocessor) finish in one chunk and
// each fire a single "progress" event at 100% before the large weights file even
// starts, so forwarding raw per-file percent spikes the bar to 100% then resets
// to 0%. Aggregate by bytes across files instead (same approach as video/engine.ts).
// Sub-MB metadata files are excluded so the bar tracks the weights download and
// climbs monotonically — without their totals up front they would still spike.
const MIN_PROGRESS_BYTES = 1024 * 1024;

const aggregateDownloadProgress = (
	onProgress: ((p: RemoveProgress) => void) | undefined,
): ((e: ProgressInfo) => void) => {
	const perFile = new Map<string, { loaded: number; total: number }>();
	return (e) => {
		if (e.status !== "progress" || e.total < MIN_PROGRESS_BYTES) return;
		perFile.set(e.file, { loaded: e.loaded, total: e.total });
		let loaded = 0;
		let total = 0;
		for (const f of perFile.values()) {
			loaded += f.loaded;
			total += f.total;
		}
		if (total === 0) return;
		onProgress?.({
			stage: "downloading",
			percent: Math.min(100, Math.round((loaded / total) * 100)),
		});
	};
};

// True once the model has been built and cached in this session's module Ref.
// Lets the route skip the consent gate on SPA re-navigation (the Ref outlives
// the unmounted component, though not a full page reload).
export const isModelLoaded: Effect.Effect<boolean> = Ref.get(modelRef).pipe(
	Effect.map(Option.isSome),
);

// Download and build the model without running inference, so the route can
// front the one-time download with a consent gate before any image is picked
// (mirrors video loadEngine). The model is memoized in modelRef, so the later
// removeBackground call reuses it instantly.
export const loadBackgroundModel = (
	onProgress?: (p: RemoveProgress) => void,
): Effect.Effect<void, ModelLoadError> =>
	loadPipeline(aggregateDownloadProgress(onProgress)).pipe(Effect.asVoid);

export const removeBackground = (
	input: RemoveBackgroundInput,
): Effect.Effect<Blob, BackgroundRemovalError> =>
	Effect.gen(function* () {
		yield* validateSize(input.file);

		const model = yield* loadPipeline(
			aggregateDownloadProgress(input.onProgress),
		);

		return yield* useSourceUrl(input.file, (sourceUrl) =>
			Effect.gen(function* () {
				input.onProgress?.({ stage: "processing" });

				// Decode with <img> before inference so transformers.js never runs
				// createImageBitmap on a format it can't handle. A genuine decode
				// failure now surfaces as DecodeError instead of a misleading
				// InferenceError.
				const canvas = yield* Effect.tryPromise({
					try: () => decodeSourceToCanvas(sourceUrl),
					catch: (err) =>
						new DecodeError({
							fileName: input.file.name,
							message:
								err instanceof Error ? err.message : "Could not decode image.",
						}),
				});

				const segments = yield* Effect.tryPromise({
					try: () => model(canvas),
					catch: (err) =>
						new InferenceError({
							fileName: input.file.name,
							message: err instanceof Error ? err.message : "Inference failed.",
						}),
				});

				const first = segments[0];
				if (!first?.mask) {
					return yield* new InferenceError({
						fileName: input.file.name,
						message: "Model returned no mask.",
					});
				}

				return yield* Effect.tryPromise({
					try: () => composeCutout(canvas, first.mask),
					catch: (err) => {
						const message =
							err instanceof Error ? err.message : "Could not compose image.";
						return message.toLowerCase().includes("decode")
							? new DecodeError({ fileName: input.file.name, message })
							: new EncodeError({
									fileName: input.file.name,
									format: "png",
									message,
								});
					},
				});
			}),
		);
	});

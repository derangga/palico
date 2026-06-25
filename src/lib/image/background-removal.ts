import type {
	ImageSegmentationPipelineOutput,
	ProgressInfo,
	RawImage,
} from "@huggingface/transformers";
import { Effect } from "effect";

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
// invocation signature we actually use (a single image URL → segmentation output).
type SegmentationModel = (
	input: string,
) => Promise<ImageSegmentationPipelineOutput[]>;

export interface RemoveProgress {
	readonly stage: "downloading" | "processing";
	readonly percent?: number;
}

export interface RemoveBackgroundInput {
	readonly file: File;
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

// Success-only module memo (no Layer system on the client). Failures are not
// cached so the user can retry by clicking Proceed again.
let cachedModel: SegmentationModel | null = null;

const loadPipeline = (
	onEvent: (e: ProgressInfo) => void,
): Effect.Effect<SegmentationModel, ModelLoadError> =>
	Effect.suspend(() =>
		cachedModel
			? Effect.succeed(cachedModel)
			: buildPipeline("webgpu", onEvent).pipe(
					Effect.orElse(() => buildPipeline("wasm", onEvent)),
					Effect.tap((model) =>
						Effect.sync(() => {
							cachedModel = model;
						}),
					),
				),
	);

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

// Composite source RGB with mask grayscale → alpha and encode as PNG.
const composeCutout = async (
	sourceUrl: string,
	mask: RawImage,
): Promise<Blob> => {
	const img = await loadHtmlImage(sourceUrl);
	const canvas = document.createElement("canvas");
	canvas.width = img.width;
	canvas.height = img.height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas 2D context unavailable.");
	ctx.drawImage(img, 0, 0);
	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

	const maskImg = await loadHtmlImage(maskToDataUrl(mask));
	const maskCanvas = document.createElement("canvas");
	maskCanvas.width = img.width;
	maskCanvas.height = img.height;
	const maskCtx = maskCanvas.getContext("2d");
	if (!maskCtx) throw new Error("Canvas 2D context unavailable.");
	maskCtx.drawImage(maskImg, 0, 0, img.width, img.height);
	const maskData = maskCtx.getImageData(0, 0, img.width, img.height);

	for (let i = 0; i < imageData.data.length; i += 4) {
		imageData.data[i + 3] = maskData.data[i];
	}
	ctx.putImageData(imageData, 0, 0);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG."))),
			"image/png",
		);
	});
};

export const removeBackground = (
	input: RemoveBackgroundInput,
): Effect.Effect<Blob, BackgroundRemovalError> =>
	Effect.gen(function* () {
		yield* validateSize(input.file);

		const model = yield* loadPipeline((e) => {
			if (e.status === "progress") {
				input.onProgress?.({
					stage: "downloading",
					percent: Math.round(e.progress),
				});
			}
		});

		return yield* useSourceUrl(input.file, (sourceUrl) =>
			Effect.gen(function* () {
				input.onProgress?.({ stage: "processing" });

				const segments = yield* Effect.tryPromise({
					try: () => model(sourceUrl),
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
					try: () => composeCutout(sourceUrl, first.mask),
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

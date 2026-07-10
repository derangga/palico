import { Effect, Ref, Schema } from "effect";
import type { LoggerMessage } from "tesseract.js";

import { type OcrError, OcrLoadError, OcrRecognitionError } from "./errors.ts";

// tesseract.js runs recognition in its own Web Worker (like transformers.js in
// background-removal.ts), so there is no wrapping Web Worker here — that would be
// a redundant worker-in-worker. Cancellation terminates the tesseract worker,
// which acquireUseRelease guarantees on success, failure, and interruption.

export const OcrLanguage = Schema.Literal("eng", "ind", "eng+ind");
export type OcrLanguage = Schema.Schema.Type<typeof OcrLanguage>;

// Two-phase progress: the one-time pack/core download vs the recognition pass.
export const OcrProgress = Schema.Union(
	Schema.Struct({
		stage: Schema.Literal("downloading"),
		percent: Schema.Number,
	}),
	Schema.Struct({
		stage: Schema.Literal("recognizing"),
		percent: Schema.Number,
	}),
);
export type OcrProgress = Schema.Schema.Type<typeof OcrProgress>;

export const OcrResult = Schema.Struct({
	text: Schema.String,
	// Mean word confidence, 0–100. Drives the low-confidence banner.
	confidence: Schema.Number,
});
export type OcrResult = Schema.Schema.Type<typeof OcrResult>;

export interface RecognizeInput {
	readonly file: Blob;
	readonly language: OcrLanguage;
	readonly onProgress?: (p: OcrProgress) => void;
}

const clampPercent = (progress: number): number =>
	Math.min(100, Math.max(0, Math.round(progress * 100)));

// tesseract emits many status strings; only this one is the recognition pass.
// Everything else (loading core, fetching/initializing traineddata) is setup.
const isRecognizing = (status: string): boolean =>
	status === "recognizing text";

const toLoadError = (err: unknown): OcrLoadError =>
	new OcrLoadError({
		message:
			err instanceof Error ? err.message : "Could not load the OCR engine.",
	});

// Session flag so the route can skip the consent gate on SPA re-navigation. The
// traineddata is also cached in IndexedDB across reloads, but we can't cheaply
// detect that — mirrors background-removal's isModelLoaded.
const readyRef = Ref.unsafeMake(false);
export const isOcrReady: Effect.Effect<boolean> = Ref.get(readyRef);

const createOcrWorker = (
	language: OcrLanguage,
	onLog: (m: LoggerMessage) => void,
): Effect.Effect<Tesseract.Worker, OcrLoadError> =>
	Effect.tryPromise({
		try: async () => {
			const { createWorker } = await import("tesseract.js");
			return createWorker(language, undefined, { logger: onLog });
		},
		catch: toLoadError,
	});

const terminateWorker = (worker: Tesseract.Worker): Effect.Effect<void> =>
	Effect.promise(() => worker.terminate()).pipe(Effect.asVoid);

// Download and cache the WASM core (HTTP cache) and both traineddata packs
// (IndexedDB) without recognizing anything, so the route can front the one-time
// download with a consent gate. We create a worker with every language, then
// terminate it — the packs stay cached, so the later recognize call is fast.
export const loadOcrLanguages = (
	onProgress?: (p: OcrProgress) => void,
): Effect.Effect<void, OcrLoadError> =>
	Effect.acquireUseRelease(
		createOcrWorker("eng+ind", (m) => {
			if (!isRecognizing(m.status)) {
				onProgress?.({
					stage: "downloading",
					percent: clampPercent(m.progress),
				});
			}
		}),
		() => Ref.set(readyRef, true),
		terminateWorker,
	);

export const recognizeText = (
	input: RecognizeInput,
): Effect.Effect<OcrResult, OcrError> =>
	Effect.acquireUseRelease(
		createOcrWorker(input.language, (m) => {
			if (isRecognizing(m.status)) {
				input.onProgress?.({
					stage: "recognizing",
					percent: clampPercent(m.progress),
				});
			}
		}),
		(worker) =>
			Effect.tryPromise({
				try: async () => {
					const { data } = await worker.recognize(input.file);
					return { text: data.text.trim(), confidence: data.confidence };
				},
				catch: (err) =>
					new OcrRecognitionError({
						message:
							err instanceof Error
								? err.message
								: "Could not read text from this image.",
					}),
			}),
		terminateWorker,
	);

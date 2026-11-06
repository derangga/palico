// Video conversion pipeline.
//
// CRITICAL: statically imports engine.ts / ffmpeg-job.ts (@ffmpeg/*). This
// module must only be reached via a dynamic import('#/lib/video/converter.ts')
// so the engine stays out of the initial route bundle (palico-rpj contract).

import { Effect, Result, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import { type EngineHandle, getEngine } from "./engine.ts";
import {
	type ConvertVideoError,
	EngineNotLoadedError,
	VideoDecodeError,
	VideoEncodeError,
} from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
import {
	ENCODER_ARGS,
	formatMeta,
	inputExtension,
	outputFileName,
	VideoOutputFormat,
} from "./types.ts";

// DOM-class schemas for the inputs and outputs the pipeline shuttles around.
// Modeled with Schema so the shape lives next to the rest of the domain even
// though we never round-trip these through `decode` at runtime.
const FileFromSelf = Schema.instanceOf(File);
const BlobFromSelf = Schema.instanceOf(Blob);

export const ConvertVideoInput = Schema.Struct({
	id: Schema.String,
	file: FileFromSelf,
	format: VideoOutputFormat,
});

export type ConvertVideoInput = Schema.Schema.Type<typeof ConvertVideoInput>;

export const ConvertVideoOutput = Schema.Struct({
	id: Schema.String,
	blob: BlobFromSelf,
	size: Schema.Number,
	name: Schema.String,
	format: VideoOutputFormat,
});

export type ConvertVideoOutput = Schema.Schema.Type<typeof ConvertVideoOutput>;

const ProgressProcessing = Schema.Struct({
	id: Schema.String,
	status: Schema.Literal("processing"),
	percent: Schema.Number,
});

const ProgressDone = Schema.Struct({
	id: Schema.String,
	status: Schema.Literal("done"),
	output: ConvertVideoOutput,
});

const ProgressError = Schema.Struct({
	id: Schema.String,
	status: Schema.Literal("error"),
	error: Schema.Union([
		EngineNotLoadedError,
		VideoDecodeError,
		VideoEncodeError,
	]),
});

export const VideoProgressUpdate = Schema.Union([
	ProgressProcessing,
	ProgressDone,
	ProgressError,
]);

export type VideoProgressUpdate = Schema.Schema.Type<
	typeof VideoProgressUpdate
>;

const emitProgress = (
	onProgress: (update: VideoProgressUpdate) => void,
	update: VideoProgressUpdate,
): Effect.Effect<void> => Effect.sync(() => onProgress(update));

const convertOne = (
	ffmpeg: EngineHandle,
	input: ConvertVideoInput,
	emitPercent: (percent: number) => void,
): Effect.Effect<ConvertVideoOutput, VideoDecodeError | VideoEncodeError> =>
	Effect.gen(function* () {
		const meta = formatMeta(input.format);
		const inputName = `input.${inputExtension(input.file)}`;
		const outputName = `output.${meta.ext}`;

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file: input.file,
			inputName,
			outputName,
			args: ["-i", inputName, ...ENCODER_ARGS[input.format], outputName],
			outputMime: meta.mime,
			label: m.job_stage_encoder(),
			oomMessage: m.error_oom_convert(),
			readError: (message) =>
				new VideoDecodeError({ fileName: input.file.name, message }),
			jobError: (message) =>
				new VideoEncodeError({
					fileName: input.file.name,
					format: input.format,
					message,
				}),
			onPercent: emitPercent,
		});

		return {
			id: input.id,
			blob,
			size: blob.size,
			name: outputFileName(input.file.name, meta.ext),
			format: input.format,
		};
	});

// Sequential per-file. ffmpeg.wasm is a single shared instance with one set
// of virtual files and one progress channel — parallel encodes would either
// OOM the browser tab or interleave progress events.
//
// The Effect fails with EngineNotLoadedError when the singleton hasn't been
// initialized; per-file decode/encode failures are caught with Effect.result
// so one bad input never aborts the batch.
//
// `isCancelled` lets the caller stop the batch: when the route terminates the
// worker (palico-zfy), `terminate()` rejects the in-flight `exec` — caught
// here as a VideoEncodeError — and every queued file then short-circuits
// without emitting a spurious "error" row. The route discards the result and
// resets the UI, so cancelled/partial outcomes are never surfaced.
export const convertVideos = (
	inputs: ReadonlyArray<ConvertVideoInput>,
	onProgress: (update: VideoProgressUpdate) => void,
	isCancelled: () => boolean = () => false,
): Effect.Effect<ReadonlyArray<ConvertVideoOutput>, EngineNotLoadedError> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;

		const results = yield* Effect.forEach(
			inputs,
			(
				input,
			): Effect.Effect<Result.Result<ConvertVideoOutput, ConvertVideoError>> =>
				Effect.gen(function* () {
					// Already cancelled before this file started — skip silently.
					if (isCancelled()) {
						return Result.fail(
							new VideoEncodeError({
								fileName: input.file.name,
								format: input.format,
								message: m.error_cancelled(),
							}),
						);
					}

					yield* emitProgress(onProgress, {
						id: input.id,
						status: "processing",
						percent: 0,
					});

					const outcome = yield* Effect.result(
						convertOne(ffmpeg, input, (percent) =>
							onProgress({
								id: input.id,
								status: "processing",
								percent,
							}),
						),
					);

					// Cancelled mid-encode (terminate() rejected the exec): swallow the
					// outcome without emitting, so the UI stays clean for the reset.
					if (isCancelled()) {
						return outcome;
					}

					if (Result.isSuccess(outcome)) {
						yield* emitProgress(onProgress, {
							id: input.id,
							status: "done",
							output: outcome.success,
						});
					} else {
						yield* emitProgress(onProgress, {
							id: input.id,
							status: "error",
							error: outcome.failure,
						});
					}

					return outcome;
				}),
			{ concurrency: 1 },
		);

		return results.flatMap((r) => (Result.isSuccess(r) ? [r.success] : []));
	});

// Re-exported for the route's catch path, which renders `ConvertVideoError`
// instances coming back from per-row Effect.result outcomes.
export type { ConvertVideoError };

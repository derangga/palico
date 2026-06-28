// Video trim pipeline — cut a single clip out of one video by STREAM COPY.
//
// CRITICAL: statically imports @ffmpeg/util. Like engine.ts / converter.ts,
// this module must only be reached via a dynamic import("#/lib/video/trim.ts")
// so the engine stays out of the initial route bundle (palico-rpj contract).
//
// Method is `-c copy`: no re-encode, so it's near-instant, lossless, and light
// on memory — but the cut snaps to the nearest keyframe, so the real start can
// land a beat before the requested second. Accepted trade-off (decided with
// the user); the route surfaces it honestly. Because nothing is decoded, ffmpeg
// emits no `progress` events — callers show an indeterminate "trimming" state.

import { fetchFile } from "@ffmpeg/util";
import { Effect, Either, Schema } from "effect";

import { disposeEngine, type EngineHandle, getEngine } from "./engine.ts";
import { type EngineNotLoadedError, VideoTrimError } from "./errors.ts";
import { formatMeta, inputExtension, parseVideoOutputFormat } from "./types.ts";

const FileFromSelf = Schema.instanceOf(File);
const BlobFromSelf = Schema.instanceOf(Blob);

export const TrimVideoInput = Schema.Struct({
	file: FileFromSelf,
	// Selection bounds in seconds, relative to the source timeline.
	startSec: Schema.Number,
	endSec: Schema.Number,
});
export type TrimVideoInput = Schema.Schema.Type<typeof TrimVideoInput>;

export const TrimVideoOutput = Schema.Struct({
	blob: BlobFromSelf,
	size: Schema.Number,
	name: Schema.String,
});
export type TrimVideoOutput = Schema.Schema.Type<typeof TrimVideoOutput>;

// The output container always matches the input. For the five formats the tool
// accepts the extension equals the format literal, so we can recover the proper
// mime via formatMeta; anything else falls back to the file's own type.
export const outputContainer = (file: File): { ext: string; mime: string } => {
	const ext = inputExtension(file);
	const parsed = parseVideoOutputFormat(ext);
	if (Either.isRight(parsed)) {
		const meta = formatMeta(parsed.right);
		return { ext: meta.ext, mime: meta.mime };
	}
	return { ext, mime: file.type || `video/${ext}` };
};

// `clip.mp4` → `clip-trimmed.mp4`. Keeps the original container extension.
export const trimmedOutputName = (srcName: string, ext: string): string => {
	const dot = srcName.lastIndexOf(".");
	const base = dot > 0 ? srcName.slice(0, dot) : srcName;
	return `${base}-trimmed.${ext}`;
};

// Pure ffmpeg arg builder, exported for unit testing. `-ss` BEFORE `-i` is
// input seeking — fast, and it's what makes the cut snap to a keyframe. `-t`
// is the output duration (end − start). No `-map`: default stream selection
// keeps the primary video + audio and avoids subtitle-into-mp4 mux errors.
export const buildTrimArgs = (
	inputName: string,
	outputName: string,
	startSec: number,
	endSec: number,
): string[] => [
	"-ss",
	String(startSec),
	"-i",
	inputName,
	"-t",
	String(endSec - startSec),
	"-c",
	"copy",
	"-avoid_negative_ts",
	"make_zero",
	outputName,
];

const trimOne = (
	ffmpeg: EngineHandle,
	input: TrimVideoInput,
): Effect.Effect<TrimVideoOutput, VideoTrimError> =>
	Effect.gen(function* () {
		const { ext, mime } = outputContainer(input.file);
		const inputName = `input.${inputExtension(input.file)}`;
		const outputName = `output.${ext}`;

		const bytes = yield* Effect.tryPromise({
			try: () => fetchFile(input.file),
			catch: (cause) =>
				new VideoTrimError({
					fileName: input.file.name,
					message:
						cause instanceof Error
							? cause.message
							: "Could not read file bytes.",
				}),
		});

		yield* Effect.tryPromise({
			try: () => ffmpeg.writeFile(inputName, bytes),
			catch: (cause) =>
				new VideoTrimError({
					fileName: input.file.name,
					message:
						cause instanceof Error ? cause.message : "Could not stage input.",
				}),
		});

		// Capture ffmpeg's stderr for this exec so a non-zero exit can surface the
		// real reason. acquireUseRelease guarantees the listener is removed even
		// on failure/interruption. No `progress` listener: `-c copy` emits none.
		const logLines: string[] = [];

		const exitCode = yield* Effect.acquireUseRelease(
			Effect.sync(() => {
				const onLog = ({ message }: { type: string; message: string }) => {
					logLines.push(message);
					if (logLines.length > 64) logLines.shift();
				};
				ffmpeg.on("log", onLog);
				return { onLog };
			}),
			() =>
				Effect.tryPromise({
					try: () =>
						ffmpeg.exec(
							buildTrimArgs(
								inputName,
								outputName,
								input.startSec,
								input.endSec,
							),
						),
					catch: (cause) =>
						new VideoTrimError({
							fileName: input.file.name,
							message: cause instanceof Error ? cause.message : "Trim threw.",
						}),
				}),
			({ onLog }) => Effect.sync(() => ffmpeg.off("log", onLog)),
		);

		if (exitCode !== 0) {
			// An emscripten OOM/abort leaves the wasm instance permanently unusable.
			// Dispose the singleton so the next run re-inits a fresh worker, and
			// surface an honest message rather than the raw log.
			const oom = /aborted\(|out of memory|\boom\b/i.test(logLines.join("\n"));
			if (oom) {
				yield* disposeEngine;
				return yield* new VideoTrimError({
					fileName: input.file.name,
					message:
						"Your device ran out of memory — this video is too large to trim in the browser. Try a smaller file.",
				});
			}

			const tail = logLines.slice(-8).join(" / ").trim();
			return yield* new VideoTrimError({
				fileName: input.file.name,
				message: tail
					? `Trim exited with code ${exitCode}. ${tail}`
					: `Trim exited with code ${exitCode}.`,
			});
		}

		const data = yield* Effect.tryPromise({
			try: () => ffmpeg.readFile(outputName),
			catch: (cause) =>
				new VideoTrimError({
					fileName: input.file.name,
					message:
						cause instanceof Error ? cause.message : "Could not read output.",
				}),
		});

		if (typeof data === "string") {
			return yield* new VideoTrimError({
				fileName: input.file.name,
				message: "ffmpeg returned a string payload instead of binary data.",
			});
		}

		// Best-effort virtual-FS cleanup; failures here don't fail the trim.
		yield* Effect.all(
			[
				Effect.tryPromise({
					try: () => ffmpeg.deleteFile(inputName),
					catch: () => "delete-failed" as const,
				}).pipe(Effect.ignore),
				Effect.tryPromise({
					try: () => ffmpeg.deleteFile(outputName),
					catch: () => "delete-failed" as const,
				}).pipe(Effect.ignore),
			],
			{ concurrency: "unbounded" },
		);

		const blob = new Blob([data as unknown as BlobPart], { type: mime });
		return {
			blob,
			size: blob.size,
			name: trimmedOutputName(input.file.name, ext),
		};
	});

// Trim a single clip. Fails with EngineNotLoadedError when the singleton hasn't
// been initialized (the route loads the engine first), or VideoTrimError on a
// read/stage/exec failure. `isCancelled` lets the route short-circuit before
// work starts; a mid-exec cancel is handled by the route terminating the worker
// (disposeEngine), which rejects the in-flight exec — caught as VideoTrimError
// and discarded by the route during its reset.
export const trimVideo = (
	input: TrimVideoInput,
	isCancelled: () => boolean = () => false,
): Effect.Effect<TrimVideoOutput, EngineNotLoadedError | VideoTrimError> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;
		if (isCancelled()) {
			return yield* new VideoTrimError({
				fileName: input.file.name,
				message: "Cancelled.",
			});
		}
		return yield* trimOne(ffmpeg, input);
	});

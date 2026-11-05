// Video trim pipeline — cut a single clip out of one video by STREAM COPY.
//
// CRITICAL: statically imports engine.ts (and so @ffmpeg/ffmpeg). Like
// converter.ts, this module must only be reached via a dynamic import("#/lib/video/trim.ts")
// so the engine stays out of the initial route bundle (palico-rpj contract).
//
// Method is `-c copy`: no re-encode, so it's near-instant, lossless, and light
// on memory — but the cut snaps to the nearest keyframe, so the real start can
// land a beat before the requested second. Accepted trade-off (decided with
// the user); the route surfaces it honestly. Because nothing is decoded, ffmpeg
// emits no `progress` events — callers show an indeterminate "trimming" state.

import { Effect, Result, Schema } from "effect";

import { type EngineHandle, getEngine } from "./engine.ts";
import { type EngineNotLoadedError, VideoTrimError } from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
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
export const outputContainer = (file: File) => {
	const ext = inputExtension(file);
	const parsed = parseVideoOutputFormat(ext);

	if (Result.isSuccess(parsed)) {
		const meta = formatMeta(parsed.success);

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

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file: input.file,
			inputName,
			outputName,
			args: buildTrimArgs(inputName, outputName, input.startSec, input.endSec),
			outputMime: mime,
			label: "Trim",
			oomMessage:
				"Your device ran out of memory. This video is too large to trim in the browser. Try a smaller file.",
			readError: (message) =>
				new VideoTrimError({ fileName: input.file.name, message }),
			jobError: (message) =>
				new VideoTrimError({ fileName: input.file.name, message }),
			// No onPercent: `-c copy` never decodes, so ffmpeg emits no progress.
		});

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

// Compress Video pipeline: one video re-encoded to a smaller H.264 MP4, either
// under a target size or at a quality level, optionally downscaled.
//
// CRITICAL: statically imports ffmpeg-job.ts (and through it @ffmpeg/*). Reach
// this module only via `await import("#/lib/video/compress.ts")` so the engine
// stays out of the route bundle (palico-rpj contract).
//
// Size mode probes the duration after staging (runFfmpegJob's args function),
// so the file is staged once and a too-small target fails before any encode.
// Quality mode skips the probe.

import { Effect, Result, Schema } from "effect";

import {
	AUDIO_KBPS_QUALITY,
	AUDIO_KBPS_SIZE,
	CompressMode,
	CompressOutput,
	CRF_BY_QUALITY,
	compressedFileName,
	planVideoKbps,
	type Resolution,
	targetBytes,
} from "./compress-options.ts";
import { type EngineHandle, getEngine } from "./engine.ts";
import {
	type EngineNotLoadedError,
	TargetTooSmallError,
	VideoCompressError,
} from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
import { readProbeJson } from "./probe.ts";
import { inputExtension } from "./types.ts";

export interface CompressInput {
	readonly file: File;
	readonly mode: CompressMode;
	readonly resolution: Resolution;
}

// Short side of `n` px, never upscaled, both sides even (yuv420p needs it).
// The quotes are filtergraph quoting so the commas stay inside the expression.
export const scaleFilter = (resolution: Resolution): string => {
	if (resolution === "original") return "scale=trunc(iw/2)*2:trunc(ih/2)*2";
	const n = resolution;

	return `scale='if(gte(iw,ih),-2,trunc(min(iw,${n})/2)*2)':'if(gte(iw,ih),trunc(min(ih,${n})/2)*2,-2)'`;
};

// Pure argv builder, exported for unit testing. `videoKbps` is required in
// size mode (from planVideoKbps) and ignored in quality mode.
export const buildCompressArgs = (
	inputName: string,
	outputName: string,
	mode: CompressMode,
	resolution: Resolution,
	videoKbps = 0,
): string[] => {
	const rate = CompressMode.guards.size(mode)
		? [
				"-b:v",
				`${videoKbps}k`,
				"-maxrate",
				`${videoKbps}k`,
				"-bufsize",
				`${videoKbps * 2}k`,
			]
		: ["-crf", String(CRF_BY_QUALITY[mode.quality])];

	const audioKbps = CompressMode.guards.size(mode)
		? AUDIO_KBPS_SIZE
		: AUDIO_KBPS_QUALITY;

	return [
		"-i",
		inputName,
		"-vf",
		scaleFilter(resolution),
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-threads",
		"2",
		// 10-bit HDR phone video would otherwise become High 10, which many
		// players reject.
		"-pix_fmt",
		"yuv420p",
		...rate,
		"-c:a",
		"aac",
		"-b:a",
		`${audioKbps}k`,
		// Index first, so upload sites can play it before it fully loads.
		"-movflags",
		"+faststart",
		outputName,
	];
};

// ffprobe writes durations as strings ("12.345000"), or leaves them out.
const DurationProbe = Schema.fromJsonString(
	Schema.Struct({
		format: Schema.Struct({
			duration: Schema.optional(Schema.NumberFromString),
		}),
	}),
);

const decodeDurationProbe = Schema.decodeUnknownResult(DurationProbe);

// ffprobe JSON (`-show_entries format=duration -of json`) → seconds, Failure when
// the duration is missing, not a number, or not positive.
export const parseDurationProbe = (
	json: string,
): Result.Result<number, string> =>
	Result.flatMap(
		Result.mapError(decodeDurationProbe(json), (e) => e.message),
		({ format }) =>
			format.duration !== undefined &&
			Number.isFinite(format.duration) &&
			format.duration > 0
				? Result.succeed(format.duration)
				: Result.fail("No duration in probe output."),
	);

const NO_LENGTH = "Could not read this video's length. Try Quality mode.";

// Probe → plan → argv for size mode. Fails before any encode when the length
// is unreadable or the target is too small for it.
const sizeModeArgs = (
	ffmpeg: EngineHandle,
	inputName: string,
	outputName: string,
	fileName: string,
	targetMB: number,
	resolution: Resolution,
): Effect.Effect<string[], VideoCompressError | TargetTooSmallError> =>
	Effect.gen(function* () {
		const json = yield* readProbeJson({
			ffmpeg,
			args: [
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"json",
				inputName,
			],
			unreadable: NO_LENGTH,
			error: (message) => new VideoCompressError({ fileName, message }),
		});

		const duration = yield* Result.match(parseDurationProbe(json), {
			onFailure: () =>
				Effect.fail(new VideoCompressError({ fileName, message: NO_LENGTH })),
			onSuccess: (seconds) => Effect.succeed(seconds),
		});

		const plan = planVideoKbps(targetMB, duration);

		if (plan.kind === "too-small") {
			return yield* new TargetTooSmallError({
				fileName,
				targetMB,
				minMB: plan.minMB,
				message: `This video needs at least ${plan.minMB} MB at this length.`,
			});
		}

		return buildCompressArgs(
			inputName,
			outputName,
			CompressMode.cases.size.make({ targetMB }),
			resolution,
			plan.videoKbps,
		);
	});

// Exported so tests can pass a fake EngineHandle.
export const compressOne = (
	ffmpeg: EngineHandle,
	input: CompressInput,
	onPercent?: (percent: number) => void,
): Effect.Effect<CompressOutput, VideoCompressError | TargetTooSmallError> =>
	Effect.gen(function* () {
		const { file, mode, resolution } = input;
		const inputName = `input.${inputExtension(file)}`;
		const outputName = "output.mp4";

		const error = (message: string) =>
			new VideoCompressError({ fileName: file.name, message });

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file,
			inputName,
			outputName,
			args: CompressMode.guards.size(mode)
				? (engine) =>
						sizeModeArgs(
							engine,
							inputName,
							outputName,
							file.name,
							mode.targetMB,
							resolution,
						)
				: buildCompressArgs(inputName, outputName, mode, resolution),
			outputMime: "video/mp4",
			label: "Encoder",
			oomMessage: "Your device ran out of memory. Try 720p or a smaller file.",
			readError: error,
			jobError: error,
			onPercent,
		});

		if (blob.size >= file.size) {
			return CompressOutput.kept({ size: file.size });
		}

		return CompressOutput.compressed({
			blob,
			name: compressedFileName(file.name),
			size: blob.size,
			overTarget:
				CompressMode.guards.size(mode) &&
				blob.size > targetBytes(mode.targetMB),
		});
	});

// Compress one video. Fails with EngineNotLoadedError when the engine isn't
// loaded (the route loads it first), TargetTooSmallError when the size can't
// fit the video's length, or VideoCompressError on a read/probe/encode
// failure. A mid-exec cancel is the route terminating the worker; the route
// discards that error.
export const compressVideo = (
	input: CompressInput,
	isCancelled: () => boolean = () => false,
	onPercent?: (percent: number) => void,
): Effect.Effect<
	CompressOutput,
	EngineNotLoadedError | VideoCompressError | TargetTooSmallError
> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;

		if (isCancelled()) {
			return yield* new VideoCompressError({
				fileName: input.file.name,
				message: "Cancelled.",
			});
		}

		return yield* compressOne(ffmpeg, input, onPercent);
	});

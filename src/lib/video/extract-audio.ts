// Extract Audio pipeline: the first audio track of one video as MP3, M4A, Opus
// or WAV.
//
// CRITICAL: statically imports ffmpeg-job.ts (and through it @ffmpeg/*). Reach
// this module only via `await import("#/lib/video/extract-audio.ts")` so the
// engine stays out of the route bundle (palico-rpj contract).
//
// The job stages the file once, probes it with ffprobe, then copies or
// encodes. A video with no audio fails at the probe with NoAudioTrackError, so
// nothing is encoded. runFfmpegJob's cleanup covers the probe path too.

import { Effect, Either, Option } from "effect";

import {
	type AudioFormat,
	type AudioStream,
	audioFormatMeta,
	buildAudioArgs,
	parseAudioProbe,
} from "./audio.ts";
import { type EngineHandle, getEngine } from "./engine.ts";
import {
	AudioExtractError,
	type EngineNotLoadedError,
	NoAudioTrackError,
} from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
import { readProbeJson } from "./probe.ts";
import { inputExtension, outputFileName } from "./types.ts";

export interface ExtractAudioInput {
	readonly file: File;
	readonly format: AudioFormat;
}

export interface ExtractAudioOutput {
	readonly blob: Blob;
	readonly size: number;
	readonly name: string;
	// True when the stream was copied as is (no re-encode, no quality loss).
	readonly copied: boolean;
}

const UNREADABLE = "Could not read the audio in this video.";

// ffprobe the staged input for its first audio stream.
const probeAudio = (
	ffmpeg: EngineHandle,
	inputName: string,
	fileName: string,
): Effect.Effect<AudioStream, AudioExtractError | NoAudioTrackError> =>
	Effect.gen(function* () {
		const json = yield* readProbeJson({
			ffmpeg,
			args: [
				"-v",
				"error",
				"-select_streams",
				"a:0",
				"-show_entries",
				"stream=codec_name,channels",
				"-of",
				"json",
				inputName,
			],
			unreadable: UNREADABLE,
			error: (message) => new AudioExtractError({ fileName, message }),
		});

		const parsed = parseAudioProbe(json);
		if (Either.isLeft(parsed)) {
			return yield* new AudioExtractError({ fileName, message: UNREADABLE });
		}
		return yield* Option.match(parsed.right, {
			onNone: () =>
				Effect.fail(
					new NoAudioTrackError({
						fileName,
						message: "This video has no sound to extract.",
					}),
				),
			onSome: (stream) => Effect.succeed(stream),
		});
	});

const extractOne = (
	ffmpeg: EngineHandle,
	input: ExtractAudioInput,
	onPercent?: (percent: number) => void,
): Effect.Effect<ExtractAudioOutput, AudioExtractError | NoAudioTrackError> =>
	Effect.gen(function* () {
		const meta = audioFormatMeta(input.format);
		const inputName = `input.${inputExtension(input.file)}`;
		const outputName = `output.${meta.ext}`;
		const fileName = input.file.name;
		const error = (message: string) =>
			new AudioExtractError({ fileName, message });

		// Set by the args step once the probe has run.
		let copied = false;

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file: input.file,
			inputName,
			outputName,
			args: (engine) =>
				probeAudio(engine, inputName, fileName).pipe(
					Effect.map((stream) => {
						const built = buildAudioArgs(
							inputName,
							outputName,
							input.format,
							stream,
						);
						copied = built.copied;
						return built.args;
					}),
				),
			outputMime: meta.mime,
			label: "Audio encoder",
			oomMessage:
				"Your device ran out of memory. Try a smaller file, or MP3 instead of WAV.",
			readError: error,
			jobError: error,
			// A stream copy emits no progress; the route shows a spinner until a
			// percentage arrives.
			onPercent,
		});

		return {
			blob,
			size: blob.size,
			name: outputFileName(fileName, meta.ext),
			copied,
		};
	});

// Extract one audio track. Fails with EngineNotLoadedError when the engine
// isn't loaded (the route loads it first), NoAudioTrackError when the video has
// no audio, or AudioExtractError on a read/probe/encode failure. A mid-exec
// cancel is the route terminating the worker; the route discards that error.
export const extractAudio = (
	input: ExtractAudioInput,
	isCancelled: () => boolean = () => false,
	onPercent?: (percent: number) => void,
): Effect.Effect<
	ExtractAudioOutput,
	EngineNotLoadedError | AudioExtractError | NoAudioTrackError
> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;
		if (isCancelled()) {
			return yield* new AudioExtractError({
				fileName: input.file.name,
				message: "Cancelled.",
			});
		}
		return yield* extractOne(ffmpeg, input, onPercent);
	});

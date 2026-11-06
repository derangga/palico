// Audio trim pipeline: cut one clip out of an audio file by STREAM COPY.
//
// CRITICAL: statically imports engine.ts (through trim.ts and ffmpeg-job.ts), so
// reach this module only via `await import("#/lib/video/audio-trim.ts")`. That
// keeps the engine out of the route bundle (palico-rpj contract).
//
// Same command as the video cutter (`buildTrimArgs`). For audio a stream copy
// cuts on the codec's own frames (about 26 ms for MP3), so there is no keyframe
// snapping to explain. Nothing is decoded, so ffmpeg emits no progress events.

import { Effect, Option } from "effect";

import { m } from "#/paraglide/messages.js";

import { audioCutFormat } from "./audio.ts";
import { type EngineHandle, getEngine } from "./engine.ts";
import { AudioTrimError, type EngineNotLoadedError } from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
import { buildTrimArgs, trimmedOutputName } from "./trim.ts";
import { inputExtension } from "./types.ts";

export interface TrimAudioInput {
	readonly file: File;
	// Selection bounds in seconds, relative to the source timeline.
	readonly startSec: number;
	readonly endSec: number;
}

export interface TrimAudioOutput {
	readonly blob: Blob;
	readonly size: number;
	readonly name: string;
}

const trimOne = (
	ffmpeg: EngineHandle,
	input: TrimAudioInput,
): Effect.Effect<TrimAudioOutput, AudioTrimError> =>
	Effect.gen(function* () {
		const fileName = input.file.name;

		const error = (message: string) =>
			new AudioTrimError({ fileName, message });

		const format = yield* Option.match(audioCutFormat(input.file), {
			onNone: () => Effect.fail(error(m.error_audio_formats())),
			onSome: (f) => Effect.succeed(f),
		});

		const inputName = `input.${inputExtension(input.file)}`;
		const outputName = `output.${format.ext}`;

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file: input.file,
			inputName,
			outputName,
			args: buildTrimArgs(inputName, outputName, input.startSec, input.endSec),
			outputMime: format.mime,
			label: m.job_stage_trim(),
			oomMessage: m.error_oom_trim_audio(),
			readError: error,
			jobError: error,
		});

		return {
			blob,
			size: blob.size,
			name: trimmedOutputName(fileName, format.ext),
		};
	});

// Trim a single clip. Fails with EngineNotLoadedError when the engine is not
// loaded (the route loads it first) or AudioTrimError on an unsupported file or a
// read/stage/exec failure. A mid-exec cancel is the route terminating the worker;
// the route discards that error.
export const trimAudio = (
	input: TrimAudioInput,
	isCancelled: () => boolean = () => false,
): Effect.Effect<TrimAudioOutput, EngineNotLoadedError | AudioTrimError> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;

		if (isCancelled()) {
			return yield* new AudioTrimError({
				fileName: input.file.name,
				message: m.error_cancelled(),
			});
		}

		return yield* trimOne(ffmpeg, input);
	});

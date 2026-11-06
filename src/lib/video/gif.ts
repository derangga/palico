// Video to GIF pipeline: one short range of one video into an animated GIF.
//
// CRITICAL: statically imports ffmpeg-job.ts (and through it @ffmpeg/*). Reach
// this module only via `await import("#/lib/video/gif.ts")` so the engine stays
// out of the route bundle (palico-rpj contract).
//
// One exec, two palette passes: `split` feeds the same scaled frames to
// palettegen and paletteuse, so the range is decoded once. palettegen emits
// nothing until it has seen every frame, so ffmpeg's progress is meaningless
// here and callers show an indeterminate state.

import { Effect, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import { type EngineHandle, getEngine } from "./engine.ts";
import { type EngineNotLoadedError, VideoGifError } from "./errors.ts";
import { runFfmpegJob } from "./ffmpeg-job.ts";
import { GifFps } from "./gif-options.ts";
import { inputExtension, outputFileName } from "./types.ts";

export const GifInput = Schema.Struct({
	file: Schema.instanceOf(File),
	startSec: Schema.Number,
	endSec: Schema.Number,
	fps: GifFps,
	// Exact output size, from fitLongSide on the <video> element's dimensions.
	width: Schema.Number,
	height: Schema.Number,
});

export type GifInput = Schema.Schema.Type<typeof GifInput>;

export const GifOutput = Schema.Struct({
	blob: Schema.instanceOf(Blob),
	size: Schema.Number,
	name: Schema.String,
});

export type GifOutput = Schema.Schema.Type<typeof GifOutput>;

// Pure argv builder, exported for unit testing. `-ss` before `-i` is fast input
// seeking; with a re-encode ffmpeg still lands on the exact frame. fps and scale
// run before `split` so palettegen buffers small frames. stats_mode=diff and
// diff_mode=rectangle spend colours and bytes on the parts that move.
export const buildGifArgs = (
	inputName: string,
	outputName: string,
	input: Pick<GifInput, "startSec" | "endSec" | "fps" | "width" | "height">,
): string[] => [
	"-ss",
	String(input.startSec),
	"-t",
	String(input.endSec - input.startSec),
	"-i",
	inputName,
	"-vf",
	`fps=${input.fps},scale=${input.width}:${input.height}:flags=lanczos,setsar=1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
	"-loop",
	"0",
	outputName,
];

const gifOne = (
	ffmpeg: EngineHandle,
	input: GifInput,
): Effect.Effect<GifOutput, VideoGifError> =>
	Effect.gen(function* () {
		const inputName = `input.${inputExtension(input.file)}`;
		const outputName = "output.gif";

		const error = (message: string) =>
			new VideoGifError({ fileName: input.file.name, message });

		const blob = yield* runFfmpegJob({
			ffmpeg,
			file: input.file,
			inputName,
			outputName,
			args: buildGifArgs(inputName, outputName, input),
			outputMime: "image/gif",
			label: m.job_stage_gif_encoder(),
			oomMessage: m.error_oom_gif(),
			readError: error,
			jobError: error,
		});

		return {
			blob,
			size: blob.size,
			name: outputFileName(input.file.name, "gif"),
		};
	});

// Make one GIF. Fails with EngineNotLoadedError when the engine isn't loaded
// (the route loads it first) or VideoGifError on a read/stage/exec failure. A
// mid-exec cancel is the route terminating the worker (disposeEngine), which
// rejects the exec; the route discards that error.
export const makeGif = (
	input: GifInput,
	isCancelled: () => boolean = () => false,
): Effect.Effect<GifOutput, EngineNotLoadedError | VideoGifError> =>
	Effect.gen(function* () {
		const ffmpeg = yield* getEngine;

		if (isCancelled()) {
			return yield* new VideoGifError({
				fileName: input.file.name,
				message: m.error_cancelled(),
			});
		}

		return yield* gifOne(ffmpeg, input);
	});

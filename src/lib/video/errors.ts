import { Schema } from "effect";

import { VideoOutputFormat } from "./types.ts";

// Distinct failure reasons for the video pipeline. Each row in the queue can
// fail independently; the batch must continue past a single bad file.

export class EngineNotLoadedError extends Schema.TaggedError<EngineNotLoadedError>()(
	"EngineNotLoadedError",
	{
		message: Schema.String,
	},
) {}

export class VideoDecodeError extends Schema.TaggedError<VideoDecodeError>()(
	"VideoDecodeError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export class VideoEncodeError extends Schema.TaggedError<VideoEncodeError>()(
	"VideoEncodeError",
	{
		fileName: Schema.String,
		format: VideoOutputFormat,
		message: Schema.String,
	},
) {}

// The video cutter never re-encodes (stream copy only), so an "encode" error
// would mislead. A dedicated reason keeps the failure honest: a copy can still
// fail to demux/remux, run out of memory, or abort the wasm instance.
export class VideoTrimError extends Schema.TaggedError<VideoTrimError>()(
	"VideoTrimError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Extract Audio failures: reading or probing the file, encoding or copying
// the stream, or reading the output back.
export class AudioExtractError extends Schema.TaggedError<AudioExtractError>()(
	"AudioExtractError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// The video has no audio stream. Raised by the probe, before any encode, so
// the route can say so plainly instead of showing an ffmpeg failure.
export class NoAudioTrackError extends Schema.TaggedError<NoAudioTrackError>()(
	"NoAudioTrackError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Surfaces from the engine loader (cache.ts / engine.ts). `stage` mirrors the
// LoadPhase that was in flight when the failure landed, so the UI can keep
// the user oriented even after a mid-flight error.
export class EngineLoadError extends Schema.TaggedError<EngineLoadError>()(
	"EngineLoadError",
	{
		stage: Schema.Literal("downloading", "caching", "preparing"),
		message: Schema.String,
	},
) {}

export type ConvertVideoError =
	| EngineNotLoadedError
	| VideoDecodeError
	| VideoEncodeError;

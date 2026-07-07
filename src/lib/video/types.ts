// Output format metadata and ffmpeg encoder arg presets.
//
// Pure module — no @ffmpeg/* imports. Both the /video-converter route (for
// the format dropdown) and the converter pipeline import from here.

import { Either, Schema } from "effect";

export const VideoOutputFormat = Schema.Literal(
	"mp4",
	"webm",
	"mov",
	"mkv",
	"avi",
);
export type VideoOutputFormat = Schema.Schema.Type<typeof VideoOutputFormat>;

export const VideoFormatMeta = Schema.Struct({
	value: VideoOutputFormat,
	label: Schema.String,
	mime: Schema.String,
	ext: Schema.String,
});
export type VideoFormatMeta = Schema.Schema.Type<typeof VideoFormatMeta>;

// Source of truth — both `VIDEO_OUTPUT_FORMATS` (ordered for the dropdown)
// and `formatMeta` (O(1) lookup) read from this single table. Avoids a
// `find`-with-throw fallback for what is a total function at the type level.
const META: Record<VideoOutputFormat, VideoFormatMeta> = {
	mp4: { value: "mp4", label: "MP4", mime: "video/mp4", ext: "mp4" },
	webm: { value: "webm", label: "WebM", mime: "video/webm", ext: "webm" },
	mov: { value: "mov", label: "MOV", mime: "video/quicktime", ext: "mov" },
	mkv: { value: "mkv", label: "MKV", mime: "video/x-matroska", ext: "mkv" },
	avi: { value: "avi", label: "AVI", mime: "video/x-msvideo", ext: "avi" },
};

export const VIDEO_OUTPUT_FORMATS: readonly VideoFormatMeta[] = [
	META.mp4,
	META.webm,
	META.mov,
	META.mkv,
	META.avi,
];

export const formatMeta = (value: VideoOutputFormat): VideoFormatMeta =>
	META[value];

// Best-effort parse of an unknown value (e.g. `<Select onValueChange>` payload)
// into the literal union. Returns Either so callers can decide whether to fall
// back, toast, or just ignore — without the `as VideoOutputFormat` escape hatch.
const decodeFormat = Schema.decodeUnknownEither(VideoOutputFormat);
export const parseVideoOutputFormat = (
	value: unknown,
): Either.Either<VideoOutputFormat, string> =>
	Either.mapLeft(decodeFormat(value), (e) => e.message);

// Per-format ffmpeg encoder presets. The pipeline prepends `-i <input>` and
// appends the output filename; everything between is from here.
//
// MP4/MOV/MKV share H.264 (libx264) + AAC — broadest playback compatibility.
// WebM uses VP9 + Opus (modern, royalty-free). AVI uses MPEG-4 ASP + MP3 for
// compatibility with the kind of tooling that still asks for AVI.
// H.264 for mp4/mov/mkv. Tuned for ffmpeg.wasm's FIXED memory ceiling rather
// than for the smallest file: `core-mt` aborts with OOM on high-resolution
// inputs (e.g. 4K phone video) under heavier settings. `-preset veryfast`
// drops libx264's reference frames / rc-lookahead (the dominant memory
// consumers at `medium`), and `-threads 2` caps the per-thread frame buffers
// that auto-threading would otherwise multiply by the core count. `-crf 23`
// keeps quality reasonable.
const H264_ARGS: readonly string[] = [
	"-c:v",
	"libx264",
	"-preset",
	"veryfast",
	"-crf",
	"23",
	"-threads",
	"2",
	"-c:a",
	"aac",
	"-b:a",
	"128k",
];

export const ENCODER_ARGS: Record<VideoOutputFormat, readonly string[]> = {
	mp4: H264_ARGS,
	mov: H264_ARGS,
	mkv: H264_ARGS,
	// VP8, not VP9: libvpx-vp9 hard-aborts under @ffmpeg/core-mt's threading
	// (crashes within a few frames). libvpx (VP8) is lighter and stable in wasm.
	webm: ["-c:v", "libvpx", "-b:v", "1M", "-c:a", "libopus"],
	avi: ["-c:v", "mpeg4", "-q:v", "5", "-c:a", "libmp3lame"],
};

export const outputFileName = (srcName: string, ext: string): string => {
	const dot = srcName.lastIndexOf(".");
	const base = dot > 0 ? srcName.slice(0, dot) : srcName;
	return `${base}.${ext}`;
};

// Guess an extension for the in-ffmpeg input filename. ffmpeg.wasm auto-
// detects containers from content, but giving it a sensible extension helps
// with edge cases.
export const inputExtension = (file: File): string => {
	const match = /\.([^.]+)$/.exec(file.name);
	if (match) return match[1].toLowerCase();
	if (file.type.startsWith("video/")) {
		return file.type.slice("video/".length);
	}
	return "bin";
};

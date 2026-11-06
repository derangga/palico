// Audio output formats, encoder presets and the stream-copy rule.
//
// Pure module, no @ffmpeg/* imports: the /extract-audio route imports it
// statically, and later audio tools reuse the same table.

import { Effect, Option, Result, Schema } from "effect";

import { inputExtension } from "./types.ts";

export const AudioFormat = Schema.Literals(["mp3", "m4a", "opus", "wav"]);

export type AudioFormat = Schema.Schema.Type<typeof AudioFormat>;

export interface AudioFormatMeta {
	readonly value: AudioFormat;
	readonly label: string;
	readonly ext: string;
	readonly mime: string;
	// Source codec (ffprobe codec_name) this container takes as is.
	readonly copyCodec: string;
	readonly encodeArgs: readonly string[];
	// libmp3lame cannot write more than 2 channels and libopus rejects some 5.1
	// layouts, so these downmix to stereo when encoding.
	readonly stereoOnly: boolean;
}

const META: Record<AudioFormat, AudioFormatMeta> = {
	mp3: {
		value: "mp3",
		label: "MP3",
		ext: "mp3",
		mime: "audio/mpeg",
		copyCodec: "mp3",
		encodeArgs: ["-c:a", "libmp3lame", "-q:a", "2"],
		stereoOnly: true,
	},
	m4a: {
		value: "m4a",
		label: "AAC (M4A)",
		ext: "m4a",
		mime: "audio/mp4",
		copyCodec: "aac",
		encodeArgs: ["-c:a", "aac", "-b:a", "192k"],
		stereoOnly: false,
	},
	opus: {
		value: "opus",
		label: "Opus",
		ext: "opus",
		mime: "audio/ogg",
		copyCodec: "opus",
		encodeArgs: ["-c:a", "libopus", "-b:a", "128k"],
		stereoOnly: true,
	},
	wav: {
		value: "wav",
		label: "WAV",
		ext: "wav",
		mime: "audio/wav",
		copyCodec: "pcm_s16le",
		encodeArgs: ["-c:a", "pcm_s16le"],
		stereoOnly: false,
	},
};

export const AUDIO_FORMATS: readonly AudioFormatMeta[] = [
	META.mp3,
	META.m4a,
	META.opus,
	META.wav,
];

export const DEFAULT_AUDIO_FORMAT: AudioFormat = "mp3";

export const audioFormatMeta = (value: AudioFormat): AudioFormatMeta =>
	META[value];

const decodeFormat = Schema.decodeUnknownResult(AudioFormat);

export const parseAudioFormat = (
	value: string | null,
): Result.Result<AudioFormat, string> =>
	Result.mapError(decodeFormat(value), (e) => e.message);

// The first audio stream as ffprobe reports it.
export const AudioStream = Schema.Struct({
	codec_name: Schema.String,
	// 0 when ffprobe leaves it out: treated as "no downmix needed".
	channels: Schema.Number.pipe(
		Schema.withDecodingDefaultType(Effect.succeed(0)),
	),
});

export type AudioStream = Schema.Schema.Type<typeof AudioStream>;

const AudioProbe = Schema.fromJsonString(
	Schema.Struct({
		streams: Schema.Array(AudioStream).pipe(
			Schema.withDecodingDefaultType(Effect.succeed([])),
		),
	}),
);

const decodeProbe = Schema.decodeUnknownResult(AudioProbe);

// ffprobe JSON (`-select_streams a:0 -show_entries stream=codec_name,channels
// -of json`) → the first audio stream, None when the file has no audio, Failure
// when the output is not what we asked for.
export const parseAudioProbe = (
	json: string,
): Result.Result<Option.Option<AudioStream>, string> =>
	Result.match(decodeProbe(json), {
		onFailure: (e) => Result.fail(e.message),
		onSuccess: (probe) =>
			Result.succeed(Option.fromNullishOr(probe.streams[0])),
	});

// Pure argv builder, exported for unit testing. Copies the stream when the
// source codec is the one the container takes; otherwise encodes. `-map 0:a:0`
// picks the stream the probe looked at and leaves out video, cover art and
// subtitles, so `-vn` is not needed.
export const buildAudioArgs = (
	inputName: string,
	outputName: string,
	format: AudioFormat,
	stream: AudioStream,
) => {
	const meta = META[format];
	const copied = stream.codec_name === meta.copyCodec;

	const codecArgs = copied
		? ["-c:a", "copy"]
		: [
				...meta.encodeArgs,
				...(meta.stereoOnly && stream.channels > 2 ? ["-ac", "2"] : []),
			];

	return {
		args: ["-i", inputName, "-map", "0:a:0", ...codecArgs, outputName],
		copied,
	};
};

// Containers the audio cutter takes. The cut copies the stream, so the output
// keeps the input's container. Kept apart from AudioFormat (the Extract Audio
// outputs) so that tool's dropdown does not gain FLAC and OGG.
const CUT_MIME = new Map([
	["mp3", "audio/mpeg"],
	["m4a", "audio/mp4"],
	["aac", "audio/aac"],
	["wav", "audio/wav"],
	["ogg", "audio/ogg"],
	["opus", "audio/ogg"],
	["flac", "audio/flac"],
]);

export interface AudioCutFormat {
	readonly ext: string;
	readonly mime: string;
}

// The extension decides, not file.type: browsers give an empty or odd type for
// FLAC and Opus.
export const audioCutFormat = (file: File): Option.Option<AudioCutFormat> => {
	const ext = inputExtension(file);

	return Option.map(Option.fromNullishOr(CUT_MIME.get(ext)), (mime) => ({
		ext,
		mime,
	}));
};

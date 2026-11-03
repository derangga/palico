import { Either, Option } from "effect";
import { describe, expect, it } from "vitest";

import {
	AUDIO_FORMATS,
	type AudioFormat,
	buildAudioArgs,
	parseAudioProbe,
} from "./audio.ts";

const aacStereo = { codec_name: "aac", channels: 2 };

describe("buildAudioArgs", () => {
	it("copies when the source codec fits the container", () => {
		const cases: Array<[AudioFormat, string]> = [
			["mp3", "mp3"],
			["m4a", "aac"],
			["opus", "opus"],
			["wav", "pcm_s16le"],
		];
		for (const [format, codec] of cases) {
			const { args, copied } = buildAudioArgs(
				"input.mp4",
				`output.${format}`,
				format,
				{ codec_name: codec, channels: 6 },
			);
			expect(copied).toBe(true);
			expect(args).toEqual([
				"-i",
				"input.mp4",
				"-map",
				"0:a:0",
				"-c:a",
				"copy",
				`output.${format}`,
			]);
		}
	});

	it("encodes with the preset when the codec does not fit", () => {
		expect(buildAudioArgs("input.mp4", "output.mp3", "mp3", aacStereo)).toEqual(
			{
				args: [
					"-i",
					"input.mp4",
					"-map",
					"0:a:0",
					"-c:a",
					"libmp3lame",
					"-q:a",
					"2",
					"output.mp3",
				],
				copied: false,
			},
		);
		const m4a = buildAudioArgs("input.webm", "output.m4a", "m4a", {
			codec_name: "opus",
			channels: 2,
		});
		expect(m4a.copied).toBe(false);
		expect(m4a.args).toContain("aac");
	});

	it("downmixes surround to stereo for MP3 and Opus only", () => {
		const surround = { codec_name: "ac3", channels: 6 };
		for (const format of ["mp3", "opus"] as const) {
			const { args } = buildAudioArgs("in.mkv", "out", format, surround);
			expect(args.slice(-3)).toEqual(["-ac", "2", "out"]);
		}
		for (const format of ["m4a", "wav"] as const) {
			const { args } = buildAudioArgs("in.mkv", "out", format, surround);
			expect(args).not.toContain("-ac");
		}
	});

	it("leaves mono and stereo channel counts alone", () => {
		for (const channels of [1, 2]) {
			const { args } = buildAudioArgs("in.mp4", "out", "mp3", {
				codec_name: "aac",
				channels,
			});
			expect(args).not.toContain("-ac");
		}
	});

	it("has a distinct extension for every format", () => {
		const exts = AUDIO_FORMATS.map((f) => f.ext);
		expect(new Set(exts).size).toBe(exts.length);
	});
});

describe("parseAudioProbe", () => {
	it("returns the first audio stream", () => {
		const json = JSON.stringify({
			programs: [],
			streams: [{ codec_name: "aac", channels: 2 }],
		});
		expect(parseAudioProbe(json)).toEqual(Either.right(Option.some(aacStereo)));
	});

	it("returns None when the video has no audio", () => {
		expect(parseAudioProbe('{"programs":[],"streams":[]}')).toEqual(
			Either.right(Option.none()),
		);
		expect(parseAudioProbe("{}")).toEqual(Either.right(Option.none()));
	});

	it("fails on output that is not ffprobe JSON", () => {
		expect(Either.isLeft(parseAudioProbe("not json"))).toBe(true);
		expect(Either.isLeft(parseAudioProbe('{"streams":[{"channels":2}]}'))).toBe(
			true,
		);
	});
});

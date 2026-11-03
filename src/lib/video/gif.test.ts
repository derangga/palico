import { describe, expect, it } from "vitest";

import { fitLongSide, initialGifEnd, MAX_GIF_SECONDS } from "./gif-options.ts";
import { buildGifArgs } from "./gif.ts";

describe("buildGifArgs", () => {
	const args = buildGifArgs("input.mp4", "output.gif", {
		startSec: 2,
		endSec: 7.5,
		fps: 12,
		width: 480,
		height: 270,
	});

	it("seeks before -i and limits the input to the selection", () => {
		expect(args.slice(0, 6)).toEqual([
			"-ss",
			"2",
			"-t",
			"5.5",
			"-i",
			"input.mp4",
		]);
	});

	it("scales before the palette split, then generates and applies the palette", () => {
		const vf = args[args.indexOf("-vf") + 1];
		expect(vf).toBe(
			"fps=12,scale=480:270:flags=lanczos,setsar=1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
		);
	});

	it("loops forever and writes the output last", () => {
		expect(args.slice(-3)).toEqual(["-loop", "0", "output.gif"]);
	});
});

describe("fitLongSide", () => {
	it("fits landscape by width", () => {
		expect(fitLongSide(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
	});

	it("fits portrait by height", () => {
		expect(fitLongSide(1080, 1920, 480)).toEqual({ width: 270, height: 480 });
	});

	it("never upscales a small source", () => {
		expect(fitLongSide(300, 200, 640)).toEqual({ width: 300, height: 200 });
	});

	it("rounds to whole pixels", () => {
		expect(fitLongSide(1000, 333, 320)).toEqual({ width: 320, height: 107 });
	});

	it("returns null when there is no picture", () => {
		expect(fitLongSide(0, 0, 480)).toBeNull();
	});
});

describe("initialGifEnd", () => {
	it("starts with the first 5 seconds of a long video", () => {
		expect(initialGifEnd(120)).toBe(5);
	});

	it("takes the whole video when it is shorter", () => {
		expect(initialGifEnd(3.2)).toBe(3.2);
	});

	it("stays under the clip cap", () => {
		expect(initialGifEnd(120)).toBeLessThanOrEqual(MAX_GIF_SECONDS);
	});
});

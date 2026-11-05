import { Effect, Exit, Result } from "effect";
import { describe, expect, it } from "vitest";

import {
	CompressMode,
	CompressOutput,
	checkCustomSize,
	compressedFileName,
	MIN_VIDEO_KBPS,
	planVideoKbps,
	startsOnQuality,
} from "./compress-options.ts";
import {
	buildCompressArgs,
	type CompressInput,
	compressOne,
	parseDurationProbe,
	scaleFilter,
} from "./compress.ts";
import type { EngineHandle } from "./engine.ts";

describe("buildCompressArgs", () => {
	it("caps the bitrate in size mode", () => {
		const args = buildCompressArgs(
			"input.mov",
			"output.mp4",
			CompressMode.cases.size.make({ targetMB: 10 }),
			"original",
			800,
		);

		expect(args.slice(0, 2)).toEqual(["-i", "input.mov"]);
		expect(args.join(" ")).toContain("-b:v 800k -maxrate 800k -bufsize 1600k");
		expect(args.join(" ")).toContain("-b:a 96k");
		expect(args).not.toContain("-crf");
		expect(args.at(-1)).toBe("output.mp4");
	});

	it("uses CRF in quality mode", () => {
		const args = buildCompressArgs(
			"input.mp4",
			"output.mp4",
			CompressMode.cases.quality.make({ quality: "low" }),
			"720",
		);

		expect(args.join(" ")).toContain("-crf 32");
		expect(args.join(" ")).toContain("-b:a 128k");
		expect(args).not.toContain("-maxrate");
	});

	it("always writes 8-bit H.264 with the index first", () => {
		const args = buildCompressArgs(
			"input.mp4",
			"output.mp4",
			CompressMode.cases.quality.make({ quality: "medium" }),
			"original",
		).join(" ");

		expect(args).toContain("-c:v libx264 -preset veryfast -threads 2");
		expect(args).toContain("-pix_fmt yuv420p");
		expect(args).toContain("-movflags +faststart");
	});
});

describe("scaleFilter", () => {
	it("rounds the original size to even", () => {
		expect(scaleFilter("original")).toBe("scale=trunc(iw/2)*2:trunc(ih/2)*2");
	});

	it("sets the short side without upscaling", () => {
		expect(scaleFilter("720")).toBe(
			"scale='if(gte(iw,ih),-2,trunc(min(iw,720)/2)*2)':'if(gte(iw,ih),trunc(min(ih,720)/2)*2,-2)'",
		);
	});
});

describe("planVideoKbps", () => {
	it("leaves room for audio, container and the buffer", () => {
		// 10 MB over 60 s: 76,000,000 bits − 5,760,000 audio, over 62 s.
		expect(planVideoKbps(10, 60)).toEqual({ kind: "ok", videoKbps: 1132 });
	});

	it("refuses a target below the bitrate floor, naming the size that works", () => {
		const plan = planVideoKbps(25, 42 * 60);
		expect(plan.kind).toBe("too-small");

		if (plan.kind !== "too-small") return;
		// The suggested size must itself pass.
		expect(planVideoKbps(plan.minMB, 42 * 60).kind).toBe("ok");
		expect(planVideoKbps(plan.minMB - 1, 42 * 60).kind).toBe("too-small");
	});

	it("stays at or above the floor when ok", () => {
		const plan = planVideoKbps(10, 300);
		expect(plan.kind === "ok" && plan.videoKbps >= MIN_VIDEO_KBPS).toBe(true);
	});
});

describe("parseDurationProbe", () => {
	it("reads ffprobe's string duration", () => {
		expect(parseDurationProbe('{"format":{"duration":"12.345000"}}')).toEqual(
			Result.succeed(12.345),
		);
	});

	it.each([
		['{"format":{"duration":"N/A"}}'],
		['{"format":{}}'],
		['{"format":{"duration":"0.000000"}}'],
		["not json"],
	])("rejects %s", (json) => {
		expect(Result.isFailure(parseDurationProbe(json))).toBe(true);
	});
});

describe("compress-options helpers", () => {
	it("names the output so it never shadows the source", () => {
		expect(compressedFileName("clip.mov")).toBe("clip-compressed.mp4");
		expect(compressedFileName("my.trip.mp4")).toBe("my.trip-compressed.mp4");
		expect(compressedFileName("noext")).toBe("noext-compressed.mp4");
	});

	it("starts on Quality when no preset could shrink the file", () => {
		expect(startsOnQuality(9_000_000)).toBe(true);
		expect(startsOnQuality(40_000_000)).toBe(false);
	});

	it("validates the custom size field", () => {
		expect(checkCustomSize("8", 40_000_000)).toEqual({ kind: "ok", mb: 8 });
		expect(checkCustomSize("", 40_000_000).kind).toBe("invalid");
		expect(checkCustomSize("-3", 40_000_000).kind).toBe("invalid");
		expect(checkCustomSize("abc", 40_000_000).kind).toBe("invalid");
		expect(checkCustomSize("40", 40_000_000).kind).toBe("invalid");
	});
});

// A fake engine: an in-memory file map. ffprobe writes a canned probe.json,
// exec records its argv and writes `outputBytes` bytes.
const fakeEngine = (opts: { probeJson: string; outputBytes: number }) => {
	const files = new Map<string, Uint8Array>();
	const exec: string[][] = [];
	const calls = { exec, ffprobe: 0 };

	const engine: EngineHandle = {
		writeFile: async (name, data) => {
			files.set(name, data);

			return true;
		},
		readFile: async (name) => {
			const data = files.get(name);

			if (!data) throw new Error(`${name} not found`);

			return data;
		},
		deleteFile: async (name) => files.delete(name),
		terminate: () => {},
		ffprobe: async (args) => {
			calls.ffprobe++;
			files.set(
				args[args.indexOf("-o") + 1],
				new TextEncoder().encode(opts.probeJson),
			);

			return -1;
		},
		exec: async (args) => {
			calls.exec.push(args);
			files.set(args.at(-1) ?? "", new Uint8Array(opts.outputBytes));

			return 0;
		},
		on: () => {},
		off: () => {},
	};

	return { engine, files, calls };
};

const videoOf = (bytes: number) =>
	new File([new Uint8Array(bytes)], "clip.mov", { type: "video/quicktime" });

const sizeInput = (file: File, targetMB: number): CompressInput => ({
	file,
	mode: CompressMode.cases.size.make({ targetMB }),
	resolution: "original",
});

const run = (engine: EngineHandle, input: CompressInput) =>
	Effect.runPromiseExit(compressOne(engine, input));

describe("compressOne with a fake engine", () => {
	// 1 MB target over 60 s is far below the bitrate floor.
	it("fails a too-small target before encoding and cleans up", async () => {
		const fake = fakeEngine({
			probeJson: '{"format":{"duration":"60"}}',
			outputBytes: 10,
		});

		const exit = await run(fake.engine, sizeInput(videoOf(2_000_000), 1));
		expect(Exit.isFailure(exit)).toBe(true);

		if (Exit.isFailure(exit)) {
			expect(JSON.stringify(exit.cause)).toContain("TargetTooSmallError");
		}

		expect(fake.calls.exec).toHaveLength(0);
		expect(fake.files.size).toBe(0);
	});

	it("fails an unreadable length before encoding", async () => {
		const fake = fakeEngine({
			probeJson: '{"format":{"duration":"N/A"}}',
			outputBytes: 10,
		});

		const exit = await run(fake.engine, sizeInput(videoOf(2_000_000), 1));
		expect(Exit.isFailure(exit)).toBe(true);

		if (Exit.isFailure(exit)) {
			expect(JSON.stringify(exit.cause)).toContain("VideoCompressError");
		}

		expect(fake.calls.exec).toHaveLength(0);
	});

	it("keeps the original when the output is not smaller", async () => {
		const fake = fakeEngine({ probeJson: "", outputBytes: 5_000 });

		const exit = await run(fake.engine, {
			file: videoOf(5_000),
			mode: CompressMode.cases.quality.make({ quality: "medium" }),
			resolution: "original",
		});

		expect(exit).toEqual(Exit.succeed(CompressOutput.kept({ size: 5_000 })));
		expect(fake.calls.ffprobe).toBe(0);
		expect(fake.files.size).toBe(0);
	});

	it("flags an output over the target", async () => {
		const fake = fakeEngine({
			probeJson: '{"format":{"duration":"10"}}',
			outputBytes: 1_100_000,
		});

		const exit = await run(fake.engine, sizeInput(videoOf(3_000_000), 1));
		expect(Exit.isSuccess(exit)).toBe(true);

		if (Exit.isSuccess(exit)) {
			expect(CompressOutput.$is("compressed")(exit.value)).toBe(true);
			expect(exit.value).toMatchObject({
				overTarget: true,
				name: "clip-compressed.mp4",
			});
		}

		expect(fake.calls.exec[0]).toContain("-maxrate");
	});
});

import { describe, expect, it } from "vitest";

import { buildTrimArgs, outputContainer, trimmedOutputName } from "./trim.ts";

describe("buildTrimArgs", () => {
	it("seeks before -i and uses output duration (end − start)", () => {
		expect(buildTrimArgs("input.mp4", "output.mp4", 3, 11)).toEqual([
			"-ss",
			"3",
			"-i",
			"input.mp4",
			"-t",
			"8",
			"-c",
			"copy",
			"-avoid_negative_ts",
			"make_zero",
			"output.mp4",
		]);
	});

	it("stream-copies (no re-encode) and never maps streams explicitly", () => {
		const args = buildTrimArgs("input.webm", "output.webm", 0, 5);
		expect(args).toContain("-c");
		expect(args[args.indexOf("-c") + 1]).toBe("copy");
		expect(args).not.toContain("-map");
		// -ss must precede -i (fast keyframe seek).
		expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
	});

	it("handles fractional seconds", () => {
		const args = buildTrimArgs("input.mov", "output.mov", 1.5, 4);
		expect(args[args.indexOf("-t") + 1]).toBe("2.5");
	});
});

describe("trimmedOutputName", () => {
	it("inserts a -trimmed suffix before the extension", () => {
		expect(trimmedOutputName("clip.mp4", "mp4")).toBe("clip-trimmed.mp4");
		expect(trimmedOutputName("My Video.final.mov", "mov")).toBe(
			"My Video.final-trimmed.mov",
		);
	});

	it("handles names without an extension", () => {
		expect(trimmedOutputName("clip", "mp4")).toBe("clip-trimmed.mp4");
	});
});

describe("outputContainer", () => {
	it("preserves the input container and resolves its mime for the 5 formats", () => {
		expect(
			outputContainer(new File(["x"], "a.mp4", { type: "video/mp4" })),
		).toEqual({ ext: "mp4", mime: "video/mp4" });
		expect(
			outputContainer(new File(["x"], "a.mov", { type: "video/quicktime" })),
		).toEqual({ ext: "mov", mime: "video/quicktime" });
		expect(
			outputContainer(new File(["x"], "a.mkv", { type: "video/x-matroska" })),
		).toEqual({ ext: "mkv", mime: "video/x-matroska" });
	});
});

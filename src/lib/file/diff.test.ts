import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";

import { computeDiff } from "./diff.ts";
import { MAX_DIFF_INPUT_CHARS } from "./types.ts";

describe("computeDiff", () => {
	it("reports changes when the two sides differ", async () => {
		const result = await Effect.runPromise(
			computeDiff({
				original: "line one\nline two\n",
				changed: "line one\nline 2\n",
				language: "text",
			}),
		);
		expect(result.hasChanges).toBe(true);
		expect(result.metadata.hunks.length).toBeGreaterThan(0);
		// One line changed: one addition, one deletion.
		expect(result.additions).toBe(1);
		expect(result.deletions).toBe(1);
	});

	it("reports no changes when the two sides are identical", async () => {
		const same = "same content\non both sides\n";
		const result = await Effect.runPromise(
			computeDiff({ original: same, changed: same, language: "text" }),
		);
		expect(result.hasChanges).toBe(false);
		expect(result.metadata.hunks.length).toBe(0);
	});

	it("carries the selected language onto both files", async () => {
		const result = await Effect.runPromise(
			computeDiff({
				original: "const a = 1;",
				changed: "const a = 2;",
				language: "typescript",
			}),
		);
		expect(result.oldFile.lang).toBe("typescript");
		expect(result.newFile.lang).toBe("typescript");
	});

	it("fails with DiffInputTooLargeError past the per-side cap", async () => {
		const exit = await Effect.runPromiseExit(
			computeDiff({
				original: "a".repeat(MAX_DIFF_INPUT_CHARS + 1),
				changed: "",
				language: "text",
			}),
		);
		expect(Exit.isFailure(exit)).toBe(true);
		if (Exit.isFailure(exit)) {
			const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
			expect(failure?._tag).toBe("DiffInputTooLargeError");
		}
	});
});

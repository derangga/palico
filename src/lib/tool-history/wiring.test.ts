import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TOOLS } from "../tool-categories.ts";

const SRC = join(import.meta.dirname, "..", "..");

const sourceFiles = (dir: string): ReadonlyArray<string> =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);

		if (entry.isDirectory()) {
			return entry.name === "paraglide" ? [] : sourceFiles(path);
		}

		return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")
			? [path]
			: [];
	});

// Every literal path passed to recordToolUse or useRecordToolUseOnce.
const recorded = new Set(
	sourceFiles(SRC).flatMap((file) =>
		[
			...readFileSync(file, "utf8").matchAll(
				/(?:recordToolUse|useRecordToolUseOnce)\(\s*"([^"]+)"/g,
			),
		].map((match) => match[1]),
	),
);

describe("tool history wiring", () => {
	it("records every tool somewhere, so none is left out of Your tools", () => {
		const missing = TOOLS.map((tool) => tool.to).filter(
			(path) => !recorded.has(path),
		);

		expect(missing).toEqual([]);
	});

	it("only records paths that are tools, so a typo cannot go unnoticed", () => {
		const known = new Set(TOOLS.map((tool) => tool.to));
		const unknown = [...recorded].filter((path) => !known.has(path));

		expect(unknown).toEqual([]);
	});
});

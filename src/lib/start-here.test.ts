import { describe, expect, it } from "vitest";

import { START_HERE_PATHS, startHereTools } from "./start-here.ts";
import { TOOLS } from "./tool-categories.ts";

describe("start here", () => {
	it("names four distinct tools that exist in the registry", () => {
		const known = new Set(TOOLS.map((tool) => tool.to));

		expect(START_HERE_PATHS).toHaveLength(4);
		expect(new Set(START_HERE_PATHS).size).toBe(4);

		for (const path of START_HERE_PATHS) expect(known.has(path)).toBe(true);
	});

	it("returns the registry entries themselves, in order", () => {
		const tools = startHereTools();

		expect(tools.map((tool) => tool.to)).toEqual(START_HERE_PATHS);

		for (const tool of tools) expect(TOOLS).toContain(tool);
	});
});

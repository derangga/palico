import { TOOLS, type Tool } from "#/lib/tool-categories.ts";

/**
 * The four tools a first-time visitor sees under "Start here" on Home: the jobs
 * people arrive with. Paths into the registry, so a renamed route fails the test
 * in start-here.test.ts instead of showing a blank tile.
 */
export const START_HERE_PATHS: ReadonlyArray<string> = [
	"/converter",
	"/compressor",
	"/video-compressor",
	"/pdf-merge",
];

/** The registry entries for `START_HERE_PATHS`, in that order. */
export const startHereTools = (): ReadonlyArray<Tool> =>
	START_HERE_PATHS.flatMap((path) => {
		const tool = TOOLS.find((candidate) => candidate.to === path);

		return tool ? [tool] : [];
	});

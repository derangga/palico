// Builds the "Send to..." menu from the tool registry. Pure, so it is tested
// directly and a new tool joins the menu by filling in `accepts`.

import type { Tool, ToolId } from "#/lib/tool-categories.ts";

/** The registry fields the menu reads. */
export type MenuTool = Pick<Tool, "id" | "accepts" | "next">;

/** True when a MIME type matches one `accepts` entry (`image/png` or `image/*`). */
export const matchesType = (pattern: string, type: string): boolean => {
	const want = pattern.toLowerCase();
	const have = type.toLowerCase();

	if (have === "") return false;

	if (want.endsWith("/*")) return have.startsWith(want.slice(0, -1));

	return want === have;
};

/** True when the tool takes every one of these types. */
export const acceptsAll = (
	tool: Pick<Tool, "accepts">,
	types: ReadonlyArray<string>,
): boolean =>
	types.length > 0 &&
	types.every((type) =>
		tool.accepts.some((pattern) => matchesType(pattern, type)),
	);

export interface SendMenu<T extends MenuTool = Tool> {
	/** The source tool's `next` list, in its order, that take these files. */
	readonly suggested: ReadonlyArray<T>;
	/** Every other tool that takes them, in registry order. */
	readonly others: ReadonlyArray<T>;
}

/**
 * The tools a result can go to. `next` comes first, then every other tool whose
 * `accepts` matches all the output types. The source tool is never listed.
 */
export const buildSendMenu = <T extends MenuTool>(
	tools: ReadonlyArray<T>,
	from: ToolId,
	types: ReadonlyArray<string>,
): SendMenu<T> => {
	const source = tools.find((tool) => tool.id === from);
	const fits = (tool: T) => tool.id !== from && acceptsAll(tool, types);

	const suggested = (source?.next ?? []).flatMap((id) => {
		const tool = tools.find((candidate) => candidate.id === id);

		return tool !== undefined && fits(tool) ? [tool] : [];
	});

	const picked = new Set(suggested.map((tool) => tool.id));

	return {
		suggested,
		others: tools.filter((tool) => !picked.has(tool.id) && fits(tool)),
	};
};

export const isEmptyMenu = (menu: SendMenu<MenuTool>) =>
	menu.suggested.length === 0 && menu.others.length === 0;

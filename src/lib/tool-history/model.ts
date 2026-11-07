// Pure transforms on the stored value. No storage and no clock, so they are
// tested directly. The service in service.ts reads, applies one of these, and
// writes back.

import { Option, Schema } from "effect";

import {
	emptyHistory,
	MAX_RECENT,
	type RecentUse,
	SHOWN_RECENT,
	type ToolHistoryData,
	ToolHistoryJson,
} from "./shapes.ts";

const decodeJson = Schema.decodeUnknownOption(ToolHistoryJson);
const encodeJson = Schema.encodeSync(ToolHistoryJson);

// A stored value is shape-checked by Schema, then tidied: no duplicates, at most
// MAX_RECENT recent entries. Someone editing storage by hand cannot grow it.
const tidy = (data: ToolHistoryData): ToolHistoryData => {
	const seen = new Set<string>();
	const recent: Array<RecentUse> = [];

	for (const use of data.recent) {
		if (seen.has(use.to)) continue;

		seen.add(use.to);
		recent.push(use);
	}

	return {
		version: 1,
		favourites: [...new Set(data.favourites)],
		recent: recent.slice(0, MAX_RECENT),
	};
};

/** A missing, unparseable or wrong-shaped value reads as an empty history. */
export const parseHistory = (raw: Option.Option<string>): ToolHistoryData =>
	Option.match(raw, {
		onNone: () => emptyHistory,
		onSome: (text) =>
			Option.match(decodeJson(text), {
				onNone: () => emptyHistory,
				onSome: tidy,
			}),
	});

export const serializeHistory = (data: ToolHistoryData): string =>
	encodeJson(data);

/** Adds the path at the end, or removes it when it is already starred. */
export const toggleFavourite = (
	data: ToolHistoryData,
	path: string,
): ToolHistoryData => ({
	...data,
	favourites: data.favourites.includes(path)
		? data.favourites.filter((to) => to !== path)
		: [...data.favourites, path],
});

/** Moves the path to the front with the new time. Keeps MAX_RECENT entries. */
export const recordUse = (
	data: ToolHistoryData,
	path: string,
	at: number,
): ToolHistoryData => ({
	...data,
	recent: [
		{ to: path, at },
		...data.recent.filter((use) => use.to !== path),
	].slice(0, MAX_RECENT),
});

/** Empties recent and keeps the favourites. */
export const clearRecent = (data: ToolHistoryData): ToolHistoryData => ({
	...data,
	recent: [],
});

export interface YourToolsParts {
	readonly favourites: ReadonlyArray<string>;
	readonly recent: ReadonlyArray<string>;
}

/**
 * The two parts of the home row. Favourites are in the order they were starred.
 * Recent is the first SHOWN_RECENT recent tools that are known and not starred,
 * so the cap counts what the row shows, not what is stored. `known` drops paths
 * that are no longer a tool (a renamed or removed route).
 */
export const yourToolsParts = (
	data: ToolHistoryData,
	known: ReadonlySet<string>,
): YourToolsParts => {
	const favourites = data.favourites.filter((to) => known.has(to));
	const starred = new Set(favourites);

	const recent = data.recent
		.flatMap((use) =>
			known.has(use.to) && !starred.has(use.to) ? [use.to] : [],
		)
		.slice(0, SHOWN_RECENT);

	return { favourites, recent };
};

/** What the home row shows, favourites first. */
export const yourTools = (
	data: ToolHistoryData,
	known: ReadonlySet<string>,
): ReadonlyArray<string> => {
	const { favourites, recent } = yourToolsParts(data, known);

	return [...favourites, ...recent];
};

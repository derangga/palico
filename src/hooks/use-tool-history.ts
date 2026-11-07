import { useEffect, useMemo, useSyncExternalStore } from "react";

import { TOOLS } from "#/lib/tool-categories.ts";
import {
	isReturningVisitor,
	yourToolsParts,
} from "#/lib/tool-history/model.ts";
import {
	clearRecentTools,
	ensureToolHistoryLoaded,
	toggleToolFavourite,
	toolHistoryStore,
} from "#/lib/tool-history/store.ts";

const KNOWN_PATHS: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.to));

const NONE: ReadonlyArray<string> = [];

/**
 * Favourite and recently used tools. `phase` is `idle` until after mount (the
 * prerendered page never shows history), `ready` once storage has been read, and
 * `unavailable` when storage throws. See docs/recent-tools.md.
 */
export function useToolHistory() {
	const state = useSyncExternalStore(
		toolHistoryStore.subscribe,
		toolHistoryStore.get,
		toolHistoryStore.getServer,
	);

	useEffect(() => {
		ensureToolHistoryLoaded();
	}, []);

	return useMemo(() => {
		const data = state.phase === "ready" ? state.data : undefined;
		const favourites = new Set(data?.favourites ?? []);
		const parts = data ? yourToolsParts(data, KNOWN_PATHS) : undefined;

		return {
			phase: state.phase,
			isFavourite: (path: string) => favourites.has(path),
			toggleFavourite: toggleToolFavourite,
			clearRecent: clearRecentTools,
			/** Starred registry tools, in the order they were starred. */
			favouritePaths: parts?.favourites ?? NONE,
			/** Recent registry tools that are not starred, most recent first, at most six. */
			recentPaths: parts?.recent ?? NONE,
			/** Favourites first, then recent tools that are not starred. Registry tools only. */
			paths: parts ? [...parts.favourites, ...parts.recent] : NONE,
			/** True when the row has at least one tool. Never true until `ready`. */
			returning: parts ? isReturningVisitor(parts) : false,
		};
	}, [state]);
}

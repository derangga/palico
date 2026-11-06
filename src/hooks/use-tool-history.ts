import { useEffect, useMemo, useSyncExternalStore } from "react";

import { TOOLS } from "#/lib/tool-categories.ts";
import { yourToolsParts } from "#/lib/tool-history/model.ts";
import {
	clearRecentTools,
	ensureToolHistoryLoaded,
	toggleToolFavourite,
	toolHistoryStore,
} from "#/lib/tool-history/store.ts";

const KNOWN_PATHS: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.to));

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
			/** Favourites first, then recent tools that are not starred. Registry tools only. */
			paths: parts ? [...parts.favourites, ...parts.recent] : [],
			/** True when the row shows a recent tool, so Clear has something to clear. */
			hasRecent: parts ? parts.recent.length > 0 : false,
		};
	}, [state]);
}

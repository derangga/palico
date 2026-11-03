import { Effect } from "effect";
import { useEffect, useState, useSyncExternalStore } from "react";

import { ENGINES } from "#/lib/offline/engines.ts";
import type { EngineId, OfflineStatus } from "#/lib/offline/shapes.ts";
import { computeStatus } from "#/lib/offline/status.ts";
import {
	notSavedStore,
	refreshStore,
	shellStore,
} from "#/lib/offline/stores.ts";

type Store<A> = { get: () => A; subscribe: (cb: () => void) => () => void };

export const useStore = <A>(store: Store<A>): A =>
	useSyncExternalStore(store.subscribe, store.get, store.get);

const noop = () => {};
const subscribeNever = () => noop;

/**
 * What this tool can promise offline right now. Undefined until after mount, so
 * the prerendered shell never shows a status that hydration would change.
 */
export function useOfflineStatus(engine?: EngineId): OfflineStatus | undefined {
	const mounted = useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
	const shell = useStore(shellStore);
	const notSaved = useStore(notSavedStore);
	const refresh = useStore(refreshStore);
	const [cached, setCached] = useState<boolean | undefined>(undefined);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh re-checks the caches after a download
	useEffect(() => {
		if (!engine) return;
		let alive = true;
		setCached(undefined);
		void Effect.runPromise(ENGINES[engine].isCached).then((value) => {
			if (alive) setCached(value);
		});
		return () => {
			alive = false;
		};
	}, [engine, refresh]);

	if (!mounted) return undefined;
	return computeStatus({
		shell,
		engine: engine ? ENGINES[engine] : undefined,
		cached,
		notSaved: engine ? notSaved.has(engine) : false,
	});
}

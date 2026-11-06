import { useSyncExternalStore } from "react";

import { localeStore } from "#/lib/i18n/state.ts";

/**
 * The active locale. A component that calls `m.*()` re-renders on a language
 * change only when its parent does, so the root layout calls this hook and the
 * page content is keyed on the result.
 */
export function useLocale() {
	return useSyncExternalStore(
		localeStore.subscribe,
		localeStore.get,
		localeStore.get,
	);
}

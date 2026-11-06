// The React-facing view of the tool history (use with useSyncExternalStore),
// plus the one call a tool makes when a job finishes: `recordToolUse`.
//
// Nothing here reads storage at import time. The home page is prerendered, so
// the first client render has to match the server: the state starts `idle` and
// the first `useToolHistory` effect loads it.

import { Effect, ManagedRuntime, SubscriptionRef } from "effect";

import { toStore } from "#/lib/offline/state.ts";

import type { ToolHistoryStorageError } from "./errors.ts";
import { ToolHistory } from "./service.ts";
import { STORAGE_KEY, type ToolHistoryData } from "./shapes.ts";

export type ToolHistoryState =
	| { readonly phase: "idle" }
	| { readonly phase: "ready"; readonly data: ToolHistoryData }
	// Storage threw. The row stays hidden and starring is disabled.
	| { readonly phase: "unavailable" };

const IDLE: ToolHistoryState = { phase: "idle" };

const toolHistoryRuntime = ManagedRuntime.make(ToolHistory.layer);

const stateRef = Effect.runSync(SubscriptionRef.make<ToolHistoryState>(IDLE));

export const toolHistoryStore = {
	...toStore(stateRef),
	// The server and the first client render both see `idle`.
	getServer: () => IDLE,
};

// Every call ends in a state: the new data, or `unavailable` when storage threw
// or something unexpected broke. Callers never see an error or a rejected
// promise, because the UI reacts to the state.
const settle = (
	effect: Effect.Effect<ToolHistoryData, ToolHistoryStorageError, ToolHistory>,
) =>
	toolHistoryRuntime.runPromise(
		effect.pipe(
			Effect.matchCause({
				onFailure: (): ToolHistoryState => ({ phase: "unavailable" }),
				onSuccess: (data): ToolHistoryState => ({ phase: "ready", data }),
			}),
			Effect.flatMap((next) => SubscriptionRef.set(stateRef, next)),
		),
	);

const withHistory = <A, E>(
	use: (history: typeof ToolHistory.Service) => Effect.Effect<A, E>,
) =>
	Effect.gen(function* () {
		const history = yield* ToolHistory;

		return yield* use(history);
	});

const refresh = () => settle(withHistory((history) => history.load));

let started = false;

/**
 * Loads the history once per page load and keeps it current when another tab
 * changes it. Safe to call from any number of components.
 */
export function ensureToolHistoryLoaded(): void {
	if (started || typeof window === "undefined") return;

	started = true;
	void refresh();

	window.addEventListener("storage", (event) => {
		// `key` is null when the whole storage was cleared.
		if (event.key === STORAGE_KEY || event.key === null) void refresh();
	});
}

export function toggleToolFavourite(path: string): void {
	void settle(withHistory((history) => history.toggleFavourite(path)));
}

export function clearRecentTools(): void {
	void settle(withHistory((history) => history.clearRecent()));
}

/**
 * Call this when a job finishes and the result is ready to download or copy,
 * not when the page opens. Fire and forget: a storage that refuses the write
 * must never touch the tool the person is using. Pass the tool's route path,
 * for example `"/converter"`. See docs/recent-tools.md.
 */
export function recordToolUse(path: string): void {
	void settle(withHistory((history) => history.recordUse(path)));
}

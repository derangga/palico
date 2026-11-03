// Device-scoped user preferences for the video converter, persisted in
// localStorage. Best-effort: any failure (private mode, disabled storage,
// quota) degrades to a safe default rather than surfacing — mirrors the
// `isEngineCached` pattern in cache.ts (errors typed, then discarded with
// orElseSucceed / ignore, never swallowed in a raw try/catch).

import { Effect } from "effect";

const SUPPRESS_KEY = "palico:video:suppress-small-time-warning";

// Whether the user has opted out of the process-time dialog for files under
// 50MB. Files >= 50MB ignore this and always warn. Defaults to false (show).
export const getSuppressSmallWarning: Effect.Effect<boolean> = Effect.try({
	try: () => {
		if (typeof localStorage === "undefined") return false;

		return localStorage.getItem(SUPPRESS_KEY) === "true";
	},
	catch: () => "storage-unavailable" as const,
}).pipe(Effect.orElseSucceed(() => false));

export const setSuppressSmallWarning = (value: boolean): Effect.Effect<void> =>
	Effect.try({
		try: () => {
			if (typeof localStorage === "undefined") return;
			localStorage.setItem(SUPPRESS_KEY, value ? "true" : "false");
		},
		catch: () => "storage-unavailable" as const,
	}).pipe(Effect.ignore);

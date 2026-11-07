import { Effect } from "effect";

import { withBusy } from "./busy.ts";
import { ENGINES } from "./engines.ts";
import type { StorageQuotaError } from "./errors.ts";
import type { StorageHost } from "./hosts.ts";
import type { EngineId } from "./shapes.ts";
import { afterDownload, preflightDownload } from "./storage.ts";
import { requestOffline } from "./toggle.ts";

// Wraps an engine load (the consent-gated download) with the offline bookkeeping:
// refuse early when the device has no room, mark the page busy while it runs
// (so an update cannot reload mid-download), then confirm the bytes were kept and
// ask the browser to keep them. `load` is unchanged; it still reports its own
// progress and errors.
//
// A real download also turns offline on: a saved engine is useless offline without
// the app shell, and starting a download is consent. An engine that was already
// saved does not, because this wrapper also runs on every visit to a tool, and a
// person who pressed "Stop saving offline" must not be switched back on by it.
export const guardedEngineLoad = <A, E, R>(
	id: EngineId,
	load: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | StorageQuotaError, R | StorageHost> =>
	Effect.gen(function* () {
		const wasCached = yield* ENGINES[id].isCached;

		yield* preflightDownload(id);
		const result = yield* withBusy(load);
		yield* afterDownload(id);

		if (!wasCached) yield* requestOffline;

		return result;
	});

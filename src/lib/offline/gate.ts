import { Effect } from "effect";

import { withBusy } from "./busy.ts";
import type { StorageQuotaError } from "./errors.ts";
import type { StorageHost } from "./hosts.ts";
import type { EngineId } from "./shapes.ts";
import { afterDownload, preflightDownload } from "./storage.ts";

// Wraps an engine load (the consent-gated download) with the offline bookkeeping:
// refuse early when the device has no room, mark the page busy while it runs
// (so an update cannot reload mid-download), then confirm the bytes were kept and
// ask the browser to keep them. `load` is unchanged; it still reports its own
// progress and errors.
export const guardedEngineLoad = <A, E, R>(
	id: EngineId,
	load: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | StorageQuotaError, R | StorageHost> =>
	preflightDownload(id).pipe(
		Effect.zipRight(withBusy(load)),
		Effect.tap(() => afterDownload(id)),
	);

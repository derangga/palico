import { Effect, Option, Queue, Ref, SubscriptionRef } from "effect";

import type { OfflineCacheError, SwDisableError } from "./errors.ts";
import { CacheHost, ServiceWorkerHost } from "./hosts.ts";
import { ShellState } from "./shapes.ts";
import {
	disableQueue,
	enableQueue,
	handleRef,
	markOff,
	shellRef,
} from "./state.ts";
import { precacheBuckets } from "./storage.ts";

// Turning offline on and off by request. startOffline owns the worker; these two
// only talk to it through the queues and the shell state.

// Ask startOffline to register the worker now. R-free, so any caller (a button,
// a toast action, the engine download gate) can run it. Only an Off shell (never
// turned on, or turned off) or a Failed one (try again) starts anything; while a
// worker is registering, installing or active, and where workers are unsupported,
// it does nothing. The shell moves to Registering at once, so a second call sees
// it and the pill answers before the fiber wakes.
export const requestOffline: Effect.Effect<void> = Effect.gen(function* () {
	const shell = yield* SubscriptionRef.get(shellRef);

	if (!ShellState.guards.Off(shell) && !ShellState.guards.Failed(shell)) return;

	yield* SubscriptionRef.set(shellRef, ShellState.cases.Registering.make({}));
	yield* Queue.offer(enableQueue, undefined);
});

// "Stop saving offline": unregister the worker, end its session, delete the app
// shell precache, and go back to Off. Engine buckets (ffmpeg, zetaoffice, qpdf,
// model, ort) stay: they are the person's own downloads and a later enable reuses
// them.
//
// Order: if the unregister fails nothing changed. Once the registration is gone
// the choice is remembered (so an installed app does not switch itself back on at
// the next launch) and the shell goes Off, even if deleting the precache then
// fails; that failure is reported and the leftover files go with the next stop.
//
// The stop signal is only sent when a session really runs (it holds a handle).
// Otherwise nothing would consume it and it would end the next session. In that
// case a pending enable request is cancelled and the shell goes Off here. A
// session that already took the request and is still registering is left to
// finish: it ends registered and Active, which is consistent.
export const stopOffline: Effect.Effect<
	void,
	SwDisableError | OfflineCacheError,
	ServiceWorkerHost | CacheHost
> = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;
	const cache = yield* CacheHost;

	yield* host.unregister;
	yield* host.setOptedOut(true);

	if (Option.isSome(yield* Ref.get(handleRef))) {
		// The startOffline loop ends the session, then sets the shell Off.
		yield* Queue.offer(disableQueue, undefined);
	} else {
		yield* Queue.clear(enableQueue);
		yield* markOff;
	}

	const names = precacheBuckets(yield* cache.keys);
	yield* Effect.forEach(names, (name) => cache.delete(name), {
		discard: true,
	});
});

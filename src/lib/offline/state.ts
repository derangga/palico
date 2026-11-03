// Page-wide offline state. Module-level refs, like the engine singletons in
// video/engine.ts. SubscriptionRef lets React subscribe through `toStore`.

import { Effect, Fiber, Option, Ref, Stream, SubscriptionRef } from "effect";

import type { SwHandle } from "./hosts.ts";
import type { EngineId, ShellState, UpdateState } from "./shapes.ts";

const make = <A>(a: A) => Effect.runSync(SubscriptionRef.make<A>(a));

// Dev builds never register a worker, so "Unsupported" is the honest default.
export const shellRef = make<ShellState>({ _tag: "Unsupported" });
export const updateRef = make<UpdateState>("idle");
// Another tab let a newer worker take over; this tab's chunks may be gone.
export const reloadNeededRef = make(false);
// Number of running jobs (see busy.ts).
export const busyRef = make(0);
// Engines downloaded this session whose bytes the browser did not keep.
export const notSavedRef = make<ReadonlySet<EngineId>>(new Set());
// Bumped after every engine download so status hooks re-check the caches.
export const refreshRef = make(0);
export const handleRef = Ref.makeUnsafe<Option.Option<SwHandle>>(Option.none());

export const resetOfflineState = Effect.all([
	SubscriptionRef.set(shellRef, { _tag: "Unsupported" }),
	SubscriptionRef.set(updateRef, "idle"),
	SubscriptionRef.set(reloadNeededRef, false),
	SubscriptionRef.set(busyRef, 0),
	SubscriptionRef.set(notSavedRef, new Set()),
	SubscriptionRef.set(refreshRef, 0),
	Ref.set(handleRef, Option.none()),
]).pipe(Effect.asVoid);

// useSyncExternalStore adapter.
export const toStore = <A>(ref: SubscriptionRef.SubscriptionRef<A>) => ({
	get: (): A => Effect.runSync(SubscriptionRef.get(ref)),
	subscribe: (onChange: () => void): (() => void) => {
		const fiber = Effect.runFork(
			Stream.runForEach(SubscriptionRef.changes(ref), () =>
				Effect.sync(onChange),
			),
		);
		return () => {
			Effect.runFork(Fiber.interrupt(fiber));
		};
	},
});

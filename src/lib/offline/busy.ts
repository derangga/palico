import { Effect, SubscriptionRef } from "effect";

import { busyRef } from "./state.ts";

// Marks a long job as running so an update cannot reload the page under it. The
// count drops on success, failure and interrupt (video cancel terminates the
// worker, and the release still runs). A count below zero means our own
// acquire/release pairing is broken, which is a bug, so it dies.
export const withBusy = <A, E, R>(
	job: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
	Effect.acquireUseRelease(
		SubscriptionRef.update(busyRef, (n) => n + 1),
		() => job,
		() =>
			SubscriptionRef.updateEffect(busyRef, (n) =>
				n <= 0
					? Effect.die(new Error("busy counter released below zero"))
					: Effect.succeed(n - 1),
			),
	);

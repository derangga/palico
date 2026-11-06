import { Effect, Fiber, Option, Ref, SubscriptionRef } from "effect";

import { m } from "#/paraglide/messages.js";

import { SwUpdateError, UpdateBlockedError } from "./errors.ts";
import { ServiceWorkerHost } from "./hosts.ts";
import { busyRef, handleRef, updateRef } from "./state.ts";

// User clicked Update. Never runs while a job is active. Order matters: the
// controllerchange listener is armed before SKIP_WAITING is posted, so the event
// cannot be missed. Reloads exactly once.
export const applyUpdate = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;
	const busy = yield* SubscriptionRef.get(busyRef);

	if (busy > 0) {
		return yield* new UpdateBlockedError({
			busy,
			message: m.error_update_blocked(),
		});
	}

	const handle = yield* Ref.get(handleRef);

	if (Option.isNone(handle)) {
		return yield* new SwUpdateError({
			message: m.error_offline_not_running(),
		});
	}

	yield* SubscriptionRef.set(updateRef, "applying");
	const changed = yield* Effect.forkChild(host.awaitControllerChange);
	yield* handle.value.activateWaiting;
	yield* Fiber.join(changed).pipe(
		Effect.timeoutOrElse({
			duration: "5 seconds",
			orElse: () =>
				Effect.fail(
					new SwUpdateError({ message: m.error_update_unfinished() }),
				),
		}),
	);
	yield* host.reload;
}).pipe(
	// A failed attempt leaves the prompt available for another try.
	Effect.tapError(() => SubscriptionRef.set(updateRef, "waiting")),
);

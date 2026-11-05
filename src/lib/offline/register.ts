import { Effect, Option, Ref, Schedule, Stream, SubscriptionRef } from "effect";

import type { SwRegistrationError } from "./errors.ts";
import { ServiceWorkerHost, type SwEvent, type SwHandle } from "./hosts.ts";
import { ShellState } from "./shapes.ts";
import {
	adoptingRef,
	handleRef,
	reloadNeededRef,
	shellRef,
	updateRef,
} from "./state.ts";
import { cleanupStaleCaches } from "./storage.ts";

export const SW_URL = "/sw.js";

const promptUpdate = SubscriptionRef.update(updateRef, (s) =>
	s === "applying" ? s : "waiting",
);

// A worker is waiting. Navigations are network first, so after a deploy the page
// usually already runs the waiting worker's build: activate it without a prompt
// or reload. Otherwise (the page came from the offline shell, or a deploy landed
// while the tab was open) the user gets the update prompt.
const onWaiting = (handle: SwHandle) =>
	Effect.gen(function* () {
		const host = yield* ServiceWorkerHost;
		const build = yield* handle.waitingBuild;

		if (Option.getOrUndefined(build) !== host.pageBuild)
			return yield* promptUpdate;

		yield* Ref.set(adoptingRef, true);
		yield* handle.activateWaiting.pipe(
			Effect.catchTag("SwUpdateError", () =>
				Ref.set(adoptingRef, false).pipe(Effect.andThen(promptUpdate)),
			),
		);
	});

const onEvent =
	(handle: SwHandle) =>
	(event: SwEvent): Effect.Effect<void, never, ServiceWorkerHost> => {
		switch (event) {
			case "update-waiting":
				return onWaiting(handle);
			case "activated":
				return SubscriptionRef.set(shellRef, ShellState.cases.Active.make({}));
			case "controller-changed":
				// A first install claiming the page is not an update. After an update
				// the old build's lazy chunks are gone, so this tab must reload. Our
				// own Update click ("applying") reloads on its own, and adopting a
				// worker of this page's build needs no reload.
				return handle.hadController
					? Effect.gen(function* () {
							if (yield* Ref.getAndSet(adoptingRef, false)) return;
							if ((yield* SubscriptionRef.get(updateRef)) === "applying")
								return;
							yield* SubscriptionRef.set(reloadNeededRef, true);
						})
					: Effect.void;
		}
	};

// Check for a new worker when the tab becomes visible and every hour. A failed
// check is ignored: being offline is normal here.
const pollUpdates = (handle: SwHandle) =>
	Effect.gen(function* () {
		const host = yield* ServiceWorkerHost;
		yield* Stream.merge(
			Stream.fromSchedule(Schedule.spaced("1 hour")),
			host.pageVisible,
		).pipe(Stream.runForEach(() => Effect.ignore(handle.update)));
	});

// Registers the worker and keeps the offline state in step with it. Runs for the
// life of the page; interrupt the fiber to remove every listener. Unsupported
// browsers and registration failures are not retried: the browser retries a
// failed install on the next load, and the app keeps working online either way.
export const startOffline = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;

	if (!host.supported) {
		yield* SubscriptionRef.set(shellRef, ShellState.cases.Unsupported.make({}));

		return;
	}

	yield* SubscriptionRef.set(shellRef, ShellState.cases.Registering.make({}));
	yield* host.windowLoaded;
	const handle = yield* host.register(SW_URL);
	yield* Ref.set(handleRef, Option.some(handle));
	yield* SubscriptionRef.set(
		shellRef,
		handle.initial === "active"
			? ShellState.cases.Active.make({})
			: ShellState.cases.Installing.make({}),
	);

	if (handle.hasWaiting && handle.hadController) yield* onWaiting(handle);

	yield* Effect.forkScoped(
		handle.events.pipe(Stream.runForEach(onEvent(handle))),
	);
	yield* Effect.forkScoped(pollUpdates(handle));
	yield* Effect.forkScoped(Effect.ignore(cleanupStaleCaches));

	return yield* Effect.never;
}).pipe(
	Effect.scoped,
	Effect.catchTag("SwRegistrationError", (e: SwRegistrationError) =>
		SubscriptionRef.set(
			shellRef,
			ShellState.cases.Failed.make({ message: e.message }),
		).pipe(
			Effect.andThen(
				Effect.logWarning(`Offline mode unavailable: ${e.message}`),
			),
		),
	),
);

import {
	Effect,
	Option,
	Queue,
	Ref,
	Schedule,
	Stream,
	SubscriptionRef,
} from "effect";

import type { SwRegistrationError } from "./errors.ts";
import { ServiceWorkerHost, type SwEvent, type SwHandle } from "./hosts.ts";
import { ShellState } from "./shapes.ts";
import {
	adoptingRef,
	disableQueue,
	enableQueue,
	handleRef,
	markOff,
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

// One registered session: register now, then keep the offline state in step with
// the worker. Runs until it is interrupted (the person turned offline off) or the
// registration fails. A failure is not retried here: the browser retries a failed
// install on the next load, a later enable request tries again, and the app keeps
// working online either way.
const registeredSession = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;

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

// Blocks until the person asks for offline use (requestOffline) or installs the
// app. Either one is consent to save the app shell, so it also clears a stored
// opt-out (see ServiceWorkerHost.optedOut).
const waitForEnable = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;

	yield* Effect.raceFirst(
		Queue.take(enableQueue),
		host.appInstalled.pipe(Stream.take(1), Stream.runDrain),
	);
	yield* host.setOptedOut(false);
});

// One pass of the loop: run a session until it ends or a stop signal arrives. The
// disable queue is emptied first, so a signal left over from an earlier session
// cannot end this one. When the stop signal wins, this loop is what sets the shell
// Off, after the session's listeners are gone. A failed registration already set
// the shell to Failed.
const runSession = Effect.gen(function* () {
	yield* Queue.clear(disableQueue);

	const outcome = yield* Effect.raceFirst(
		registeredSession.pipe(Effect.as("ended" as const)),
		Queue.take(disableQueue).pipe(Effect.as("disabled" as const)),
	);

	if (outcome === "disabled") yield* markOff;
});

// Keeps the offline state in step with the worker for the life of the page;
// interrupt the fiber to remove every listener.
//
// A plain visit registers nothing: updates then reach the person on the next
// load with no service worker in between. A worker is registered at startup only
// when one already exists (the person turned offline on before) or the page runs
// as an installed app the person has not opted out of. Otherwise the shell is Off
// until an enable request or the install event. Turning offline off (stopOffline) ends the session and the loop
// waits for the next enable, so the person can switch it on again without a reload.
export const startOffline = Effect.gen(function* () {
	const host = yield* ServiceWorkerHost;

	if (!host.supported) {
		yield* SubscriptionRef.set(shellRef, ShellState.cases.Unsupported.make({}));

		return;
	}

	yield* SubscriptionRef.set(shellRef, ShellState.cases.Registering.make({}));
	const hasRegistration = yield* host.hasRegistration;
	const standalone = yield* host.standalone;
	const optedOut = yield* host.optedOut;

	if (!hasRegistration && (!standalone || optedOut)) {
		yield* SubscriptionRef.set(shellRef, ShellState.cases.Off.make({}));
		yield* waitForEnable;
	}

	// After a session ends (registration failed, or offline was turned off) wait
	// for the next enable request.
	return yield* Effect.forever(runSession.pipe(Effect.andThen(waitForEnable)));
});

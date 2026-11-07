// Test doubles for the three host services. Not imported by app code.
import { Effect, Layer, Option, Queue, Stream } from "effect";

import {
	StorageUnavailableError,
	SwDisableError,
	SwRegistrationError,
} from "./errors.ts";
import {
	CacheHost,
	controlledAtRegistration,
	ServiceWorkerHost,
	StorageHost,
	type SwEvent,
	type SwHandle,
} from "./hosts.ts";

export const makeFakeSw = (
	opts: {
		supported?: boolean;
		// A worker is already registered at startup. Defaults to true, so a test
		// opts out to model a first-time visitor.
		registered?: boolean;
		standalone?: boolean;
		// The stored "Stop saving offline" choice at startup.
		optedOut?: boolean;
		unregisterFails?: boolean;
		// The first N register calls fail, to model a failed install.
		registerFailures?: number;
		initial?: "active" | "installing";
		// A worker controls the page. It stays true after unregister, like a real
		// page, whose old controller lives on until reload.
		hadController?: boolean;
		hasWaiting?: boolean;
		controllerChangeOnActivate?: boolean;
		pageBuild?: string;
		// What the waiting worker answers to GET_BUILD; undefined means no answer.
		waitingBuild?: string;
	} = {},
) => {
	const calls = {
		register: 0,
		unregister: 0,
		update: 0,
		activate: 0,
		reload: 0,
	};

	let registered = opts.registered ?? true;
	let optedOut = opts.optedOut ?? false;
	let failuresLeft = opts.registerFailures ?? 0;
	const events = Effect.runSync(Queue.unbounded<SwEvent>());
	const controllerChanges = Effect.runSync(Queue.unbounded<void>());
	const visible = Effect.runSync(Queue.unbounded<void>());
	const installed = Effect.runSync(Queue.unbounded<void>());

	// Built per register call: hadController follows the same rule as the live
	// host, so a stale controller without an active worker does not count.
	const makeHandle = (activeWorker: boolean): SwHandle => ({
		initial: opts.initial ?? "active",
		hadController: controlledAtRegistration({
			hasActiveWorker: activeWorker,
			hasController: opts.hadController ?? true,
		}),
		hasWaiting: opts.hasWaiting ?? false,
		events: Stream.fromQueue(events),
		update: Effect.sync(() => {
			calls.update++;
		}),
		waitingBuild: Effect.succeed(Option.fromUndefinedOr(opts.waitingBuild)),
		activateWaiting: Effect.suspend(() => {
			calls.activate++;

			return opts.controllerChangeOnActivate === false
				? Effect.void
				: Queue.offer(controllerChanges, undefined).pipe(Effect.asVoid);
		}),
	});

	const layer = Layer.succeed(ServiceWorkerHost, {
		supported: opts.supported ?? true,
		pageBuild: opts.pageBuild ?? "build-a",
		windowLoaded: Effect.void,
		hasRegistration: Effect.sync(() => registered),
		standalone: Effect.succeed(opts.standalone ?? false),
		optedOut: Effect.sync(() => optedOut),
		setOptedOut: (value) =>
			Effect.sync(() => {
				optedOut = value;
			}),
		appInstalled: Stream.fromQueue(installed),
		unregister: Effect.suspend(() => {
			calls.unregister++;

			if (opts.unregisterFails) {
				return Effect.fail(new SwDisableError({ message: "nope" }));
			}

			registered = false;

			return Effect.void;
		}),
		register: () =>
			Effect.suspend(() => {
				calls.register++;

				if (failuresLeft > 0) {
					failuresLeft--;

					return Effect.fail(
						new SwRegistrationError({ stage: "register", message: "boom" }),
					);
				}

				// An active worker exists only if one was registered before this call.
				const activeWorker =
					registered && (opts.initial ?? "active") === "active";

				registered = true;

				return Effect.succeed(makeHandle(activeWorker));
			}),
		awaitControllerChange: Queue.take(controllerChanges),
		pageVisible: Stream.fromQueue(visible),
		reload: Effect.sync(() => {
			calls.reload++;
		}),
	});

	return {
		layer,
		calls,
		emit: (e: SwEvent) => Effect.runSync(Queue.offer(events, e)),
		becomeVisible: () => Effect.runSync(Queue.offer(visible, undefined)),
		install: () => Effect.runSync(Queue.offer(installed, undefined)),
		isRegistered: () => registered,
		isOptedOut: () => optedOut,
		controllerChange: () =>
			Effect.runSync(Queue.offer(controllerChanges, undefined)),
	};
};

export const makeFakeCache = (initial: readonly string[]) => {
	const names = new Set(initial);

	const layer = Layer.succeed(CacheHost, {
		keys: Effect.sync(() => [...names]),
		delete: (name) =>
			Effect.sync(() => {
				names.delete(name);
			}),
	});

	return { layer, names };
};

export const makeFakeStorage = (opts: {
	estimate?: unknown;
	unavailable?: boolean;
	persist?: boolean;
}) => {
	const calls = { persist: 0 };

	const layer = Layer.succeed(StorageHost, {
		estimate: opts.unavailable
			? Effect.fail(new StorageUnavailableError({ message: "none" }))
			: Effect.succeed(opts.estimate),
		persist: Effect.sync(() => {
			calls.persist++;

			return opts.persist ?? true;
		}),
		persisted: Effect.succeed(opts.persist ?? true),
	});

	return { layer, calls };
};

// Lets forked fibers run to their next suspension point.
export const settle = Effect.forEach(
	Array.from({ length: 25 }),
	() => Effect.yieldNow,
	{ discard: true },
);

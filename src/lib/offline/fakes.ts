// Test doubles for the three host services. Not imported by app code.
import { Effect, Layer, Option, Queue, Stream } from "effect";

import { StorageUnavailableError } from "./errors.ts";
import {
	CacheHost,
	ServiceWorkerHost,
	StorageHost,
	type SwEvent,
	type SwHandle,
} from "./hosts.ts";

export const makeFakeSw = (
	opts: {
		supported?: boolean;
		initial?: "active" | "installing";
		hadController?: boolean;
		hasWaiting?: boolean;
		controllerChangeOnActivate?: boolean;
		pageBuild?: string;
		// What the waiting worker answers to GET_BUILD; undefined means no answer.
		waitingBuild?: string;
	} = {},
) => {
	const calls = { register: 0, update: 0, activate: 0, reload: 0 };
	const events = Effect.runSync(Queue.unbounded<SwEvent>());
	const controllerChanges = Effect.runSync(Queue.unbounded<void>());
	const visible = Effect.runSync(Queue.unbounded<void>());

	const handle: SwHandle = {
		initial: opts.initial ?? "active",
		hadController: opts.hadController ?? true,
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
	};

	const layer = Layer.succeed(ServiceWorkerHost, {
		supported: opts.supported ?? true,
		pageBuild: opts.pageBuild ?? "build-a",
		windowLoaded: Effect.void,
		register: () =>
			Effect.sync(() => {
				calls.register++;

				return handle;
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

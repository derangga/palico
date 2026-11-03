// The three browser surfaces the offline layer touches, as Effect services. The
// real ones wrap navigator.serviceWorker, CacheStorage and navigator.storage; tests
// provide fakes, so the same graph runs in node.

import { Context, Effect, Layer, Queue, Stream } from "effect";

import {
	OfflineCacheError,
	StorageUnavailableError,
	SwRegistrationError,
	SwUpdateError,
} from "./errors.ts";

// --- Service worker ---------------------------------------------------------

export type SwEvent = "update-waiting" | "activated" | "controller-changed";

export interface SwHandle {
	readonly initial: "active" | "installing";
	// True when a worker already controlled the page at registration, so a later
	// controllerchange means an update, not the first install claiming the page.
	readonly hadController: boolean;
	readonly hasWaiting: boolean;
	readonly events: Stream.Stream<SwEvent>;
	readonly update: Effect.Effect<void, SwUpdateError>;
	readonly activateWaiting: Effect.Effect<void, SwUpdateError>;
}

export interface ServiceWorkerHostShape {
	readonly supported: boolean;
	readonly windowLoaded: Effect.Effect<void>;
	readonly register: (
		url: string,
	) => Effect.Effect<SwHandle, SwRegistrationError>;
	readonly awaitControllerChange: Effect.Effect<void>;
	readonly pageVisible: Stream.Stream<void>;
	readonly reload: Effect.Effect<void>;
}

export class ServiceWorkerHost extends Context.Service<
	ServiceWorkerHost,
	ServiceWorkerHostShape
>()("palico/ServiceWorkerHost") {}

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

const makeHandle = (reg: ServiceWorkerRegistration): SwHandle => {
	const sw = navigator.serviceWorker;
	const events = Stream.callback<SwEvent>((queue) => {
		const cleanups: Array<() => void> = [];
		const watch = (worker: ServiceWorker) => {
			const onState = () => {
				if (worker.state === "installed" && sw.controller) {
					Queue.offerUnsafe(queue, "update-waiting");
				}
				if (worker.state === "activated") Queue.offerUnsafe(queue, "activated");
			};
			worker.addEventListener("statechange", onState);
			cleanups.push(() => worker.removeEventListener("statechange", onState));
		};
		const onUpdateFound = () => {
			if (reg.installing) watch(reg.installing);
		};
		const onControllerChange = () =>
			Queue.offerUnsafe(queue, "controller-changed");
		if (reg.installing) watch(reg.installing);
		reg.addEventListener("updatefound", onUpdateFound);
		sw.addEventListener("controllerchange", onControllerChange);
		return Effect.addFinalizer(() =>
			Effect.sync(() => {
				reg.removeEventListener("updatefound", onUpdateFound);
				sw.removeEventListener("controllerchange", onControllerChange);
				for (const c of cleanups) c();
			}),
		);
	});
	return {
		initial: reg.active ? "active" : "installing",
		hadController: sw.controller !== null,
		hasWaiting: reg.waiting !== null,
		events,
		update: Effect.tryPromise({
			try: () => reg.update().then(() => undefined),
			catch: (cause) => new SwUpdateError({ message: messageOf(cause) }),
		}),
		activateWaiting: Effect.suspend(() =>
			reg.waiting
				? Effect.sync(() => reg.waiting?.postMessage({ type: "SKIP_WAITING" }))
				: Effect.fail(new SwUpdateError({ message: "No update is waiting." })),
		),
	};
};

export const ServiceWorkerHostLive = Layer.succeed(ServiceWorkerHost, {
	supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
	windowLoaded: Effect.callback<void>((resume) => {
		if (document.readyState === "complete") return resume(Effect.void);
		const done = () => resume(Effect.void);
		window.addEventListener("load", done, { once: true });
		return Effect.sync(() => window.removeEventListener("load", done));
	}),
	register: (url) =>
		Effect.tryPromise({
			try: () => navigator.serviceWorker.register(url, { scope: "/" }),
			catch: (cause) =>
				new SwRegistrationError({
					stage: "register",
					message: messageOf(cause),
				}),
		}).pipe(Effect.map(makeHandle)),
	awaitControllerChange: Effect.callback<void>((resume) => {
		const done = () => resume(Effect.void);
		navigator.serviceWorker.addEventListener("controllerchange", done, {
			once: true,
		});
		return Effect.sync(() =>
			navigator.serviceWorker.removeEventListener("controllerchange", done),
		);
	}),
	pageVisible: Stream.callback<void>((queue) => {
		const onChange = () => {
			if (document.visibilityState === "visible")
				Queue.offerUnsafe(queue, undefined);
		};
		document.addEventListener("visibilitychange", onChange);
		return Effect.addFinalizer(() =>
			Effect.sync(() =>
				document.removeEventListener("visibilitychange", onChange),
			),
		);
	}),
	reload: Effect.sync(() => location.reload()),
});

// --- Cache storage ----------------------------------------------------------

export interface CacheHostShape {
	readonly keys: Effect.Effect<readonly string[], OfflineCacheError>;
	readonly delete: (name: string) => Effect.Effect<void, OfflineCacheError>;
}

export class CacheHost extends Context.Service<CacheHost, CacheHostShape>()(
	"palico/CacheHost",
) {}

export const CacheHostLive = Layer.succeed(CacheHost, {
	keys: Effect.tryPromise({
		try: () => caches.keys(),
		catch: (cause) =>
			new OfflineCacheError({ op: "keys", message: messageOf(cause) }),
	}),
	delete: (name) =>
		Effect.tryPromise({
			try: () => caches.delete(name).then(() => undefined),
			catch: (cause) =>
				new OfflineCacheError({ op: "delete", message: messageOf(cause) }),
		}),
});

// --- Storage manager --------------------------------------------------------

export interface StorageHostShape {
	// Raw estimate; decoded with StorageReport at the call site.
	readonly estimate: Effect.Effect<unknown, StorageUnavailableError>;
	// Denied (or unsupported) is a value, not an error.
	readonly persist: Effect.Effect<boolean>;
	readonly persisted: Effect.Effect<boolean>;
}

export class StorageHost extends Context.Service<
	StorageHost,
	StorageHostShape
>()("palico/StorageHost") {}

const storageApi = () =>
	typeof navigator === "undefined" ? undefined : navigator.storage;

export const StorageHostLive = Layer.succeed(StorageHost, {
	estimate: Effect.tryPromise({
		try: () => {
			const s = storageApi();
			if (!s?.estimate) throw new Error("Storage estimates are unavailable.");
			return s.estimate();
		},
		catch: (cause) =>
			new StorageUnavailableError({ message: messageOf(cause) }),
	}),
	persist: Effect.tryPromise({
		try: async () => (await storageApi()?.persist?.()) ?? false,
		catch: () => false as const,
	}).pipe(Effect.orElseSucceed(() => false)),
	persisted: Effect.tryPromise({
		try: async () => (await storageApi()?.persisted?.()) ?? false,
		catch: () => false as const,
	}).pipe(Effect.orElseSucceed(() => false)),
});

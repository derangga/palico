// The three browser surfaces the offline layer touches, as Effect services. The
// real ones wrap navigator.serviceWorker, CacheStorage and navigator.storage; tests
// provide fakes, so the same graph runs in node.

import { Context, Effect, Layer, Option, Queue, Schema, Stream } from "effect";

import { m } from "#/paraglide/messages.js";

import {
	OfflineCacheError,
	StorageUnavailableError,
	SwDisableError,
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
	// The build ID of the waiting worker. None when nothing waits, the worker does
	// not answer in time, or it predates the GET_BUILD message.
	readonly waitingBuild: Effect.Effect<Option.Option<string>>;
}

// True when a registration already had an active worker and a worker controls the
// page, so a later controllerchange or installed worker means an update. After
// "Stop saving offline" the old worker keeps controlling the page until reload;
// without the active-worker check, switching offline on again in the same visit
// would read that stale controller as "an update exists".
export const controlledAtRegistration = (
	activeWorker: unknown,
	controller: unknown,
): boolean => activeWorker !== null && controller !== null;

export interface ServiceWorkerHostApi {
	readonly supported: boolean;
	// The build ID compiled into this page (see vite.config.ts).
	readonly pageBuild: string;
	readonly windowLoaded: Effect.Effect<void>;
	// True when this origin already has a worker registered (existing users, or the
	// person turned offline on before). A failed lookup reads as false.
	readonly hasRegistration: Effect.Effect<boolean>;
	// True when the page runs as an installed app (display-mode: standalone).
	readonly standalone: Effect.Effect<boolean>;
	// The person pressed "Stop saving offline" and has not turned it on since. An
	// installed app then stays off at launch. Stored in localStorage; unreadable
	// storage reads as false.
	readonly optedOut: Effect.Effect<boolean>;
	readonly setOptedOut: (value: boolean) => Effect.Effect<void>;
	// Emits when the browser reports the app was installed (window appinstalled).
	readonly appInstalled: Stream.Stream<void>;
	readonly register: (
		url: string,
	) => Effect.Effect<SwHandle, SwRegistrationError>;
	// Removes the registration. Nothing to remove is success.
	readonly unregister: Effect.Effect<void, SwDisableError>;
	readonly awaitControllerChange: Effect.Effect<void>;
	readonly pageVisible: Stream.Stream<void>;
	readonly reload: Effect.Effect<void>;
}

export class ServiceWorkerHost extends Context.Service<
	ServiceWorkerHost,
	ServiceWorkerHostApi
>()("palico/ServiceWorkerHost") {}

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

const makeHandle = (reg: ServiceWorkerRegistration): SwHandle => {
	const sw = navigator.serviceWorker;

	const events = Stream.callback<SwEvent>((queue) => {
		const cleanups: Array<() => void> = [];

		const watch = (worker: ServiceWorker) => {
			const onState = () => {
				// An active worker exists, so this one is an update, not the first install.
				if (worker.state === "installed" && reg.active) {
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
		hadController: controlledAtRegistration(reg.active, sw.controller),
		hasWaiting: reg.waiting !== null,
		events,
		update: Effect.tryPromise({
			try: () => reg.update().then(() => undefined),
			catch: (cause) => new SwUpdateError({ message: messageOf(cause) }),
		}),
		activateWaiting: Effect.suspend(() =>
			reg.waiting
				? Effect.sync(() => reg.waiting?.postMessage({ type: "SKIP_WAITING" }))
				: Effect.fail(
						new SwUpdateError({ message: m.error_no_update_waiting() }),
					),
		),
		waitingBuild: askBuild(reg),
	};
};

// A worker's reply to GET_BUILD; anything but a string means "unknown build".
const decodeBuild = Schema.decodeUnknownOption(Schema.String);

// Asks the waiting worker for its build ID over a MessageChannel.
const askBuild = (reg: ServiceWorkerRegistration) =>
	Effect.callback<Option.Option<string>>((resume) => {
		const worker = reg.waiting;

		if (!worker) return resume(Effect.succeed(Option.none()));
		const channel = new MessageChannel();

		channel.port1.onmessage = (event) =>
			resume(Effect.succeed(decodeBuild(event.data)));
		worker.postMessage({ type: "GET_BUILD" }, [channel.port2]);

		return Effect.sync(() => channel.port1.close());
	}).pipe(
		Effect.timeoutOrElse({
			duration: "2 seconds",
			orElse: () => Effect.succeed(Option.none<string>()),
		}),
	);

const OPT_OUT_KEY = "palico-offline";

export const ServiceWorkerHostLive = Layer.succeed(ServiceWorkerHost, {
	supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
	pageBuild:
		typeof __PALICO_BUILD_ID__ === "undefined" ? "dev" : __PALICO_BUILD_ID__,
	windowLoaded: Effect.callback<void>((resume) => {
		if (document.readyState === "complete") return resume(Effect.void);
		const done = () => resume(Effect.void);
		window.addEventListener("load", done, { once: true });

		return Effect.sync(() => window.removeEventListener("load", done));
	}),
	hasRegistration: Effect.tryPromise(() =>
		navigator.serviceWorker.getRegistration(),
	).pipe(
		Effect.map((reg) => reg !== undefined),
		Effect.tapError((cause) =>
			Effect.logWarning(
				`Could not read the service worker registration: ${messageOf(cause)}`,
			),
		),
		Effect.orElseSucceed(() => false),
	),
	standalone: Effect.sync(
		() => window.matchMedia("(display-mode: standalone)").matches,
	),
	optedOut: Effect.sync(() => {
		try {
			return localStorage.getItem(OPT_OUT_KEY) === "off";
		} catch {
			return false;
		}
	}),
	setOptedOut: (value) =>
		Effect.sync(() => {
			try {
				if (value) localStorage.setItem(OPT_OUT_KEY, "off");
				else localStorage.removeItem(OPT_OUT_KEY);
			} catch {
				// Not remembered: an installed app may switch itself on again.
			}
		}),
	appInstalled: Stream.callback<void>((queue) => {
		const onInstalled = () => Queue.offerUnsafe(queue, undefined);

		window.addEventListener("appinstalled", onInstalled);

		return Effect.addFinalizer(() =>
			Effect.sync(() =>
				window.removeEventListener("appinstalled", onInstalled),
			),
		);
	}),
	unregister: Effect.tryPromise({
		try: async () => {
			const reg = await navigator.serviceWorker.getRegistration();

			await reg?.unregister();
		},
		catch: (cause) => new SwDisableError({ message: messageOf(cause) }),
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

export interface CacheHostApi {
	readonly keys: Effect.Effect<readonly string[], OfflineCacheError>;
	readonly delete: (name: string) => Effect.Effect<void, OfflineCacheError>;
}

export class CacheHost extends Context.Service<CacheHost, CacheHostApi>()(
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

export interface StorageHostApi {
	// Raw estimate; decoded with StorageReport at the call site.
	readonly estimate: Effect.Effect<unknown, StorageUnavailableError>;
	// Denied (or unsupported) is a value, not an error.
	readonly persist: Effect.Effect<boolean>;
	readonly persisted: Effect.Effect<boolean>;
}

export class StorageHost extends Context.Service<StorageHost, StorageHostApi>()(
	"palico/StorageHost",
) {}

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

import { Layer, ManagedRuntime } from "effect";

import {
	CacheHostLive,
	ServiceWorkerHostLive,
	StorageHostLive,
} from "./hosts.ts";

// One runtime for the page: provides the live browser hosts to every offline Effect.
export const OfflineLive = Layer.mergeAll(
	ServiceWorkerHostLive,
	CacheHostLive,
	StorageHostLive,
);

export const offlineRuntime = ManagedRuntime.make(OfflineLive);

import { Effect, Schema, SubscriptionRef } from "effect";

import { CURRENT_ENGINE_BUCKETS, ENGINES } from "./engines.ts";
import { StorageQuotaError } from "./errors.ts";
import { CacheHost, StorageHost } from "./hosts.ts";
import { type EngineId, StorageReport } from "./shapes.ts";
import { notSavedRef, refreshRef } from "./state.ts";

// Before an engine download: is there room? Skipped when the engine is already
// stored, and when the browser cannot report an estimate (today's behavior).
export const preflightDownload = (
	id: EngineId,
): Effect.Effect<void, StorageQuotaError, StorageHost> =>
	Effect.gen(function* () {
		const spec = ENGINES[id];
		if (yield* spec.isCached) return;
		const storage = yield* StorageHost;
		const raw = yield* storage.estimate;
		const report = yield* Schema.decodeUnknown(StorageReport)(raw);
		if (report.quota === undefined || report.usage === undefined) return;
		const available = report.quota - report.usage;
		if (available < spec.sizeBytes) {
			return yield* new StorageQuotaError({
				needed: spec.sizeBytes,
				available,
				message: `Not enough free space on this device. This download needs ${spec.sizeLabel}.`,
			});
		}
	}).pipe(
		Effect.catchTags({
			StorageUnavailableError: () => Effect.void,
			ParseError: () => Effect.void,
		}),
	);

// After an engine load: confirm the bytes were really kept (a failed cache write
// is silently ignored by the loaders), refresh the status hooks, and ask the
// browser to keep the storage. A denied request is a value, not an error.
export const afterDownload = (
	id: EngineId,
): Effect.Effect<boolean, never, StorageHost> =>
	Effect.gen(function* () {
		const saved = yield* ENGINES[id].isCached;
		yield* SubscriptionRef.update(notSavedRef, (set) => {
			const next = new Set(set);
			if (saved) next.delete(id);
			else next.add(id);
			return next;
		});
		yield* SubscriptionRef.update(refreshRef, (n) => n + 1);
		if (!saved) return false;
		const storage = yield* StorageHost;
		return yield* storage.persist;
	});

// Stale engine buckets left behind by a version bump (for example
// ffmpeg-wasm-v0.12.9 after v0.12.10) hold tens of MB each. Only the exact engine
// prefixes are touched, never the Workbox precache or the model buckets.
export const staleEngineBuckets = (names: readonly string[]): string[] =>
	names.filter(
		(n) =>
			(n.startsWith("ffmpeg-wasm-") || n.startsWith("zetaoffice-")) &&
			!CURRENT_ENGINE_BUCKETS.includes(n),
	);

export const cleanupStaleCaches = Effect.gen(function* () {
	const cache = yield* CacheHost;
	const stale = staleEngineBuckets(yield* cache.keys);
	yield* Effect.forEach(stale, (name) => cache.delete(name), {
		discard: true,
	});
});

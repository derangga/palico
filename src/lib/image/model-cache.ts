// Cache API storage for the background removal model and its ORT runtime files.
//
// transformers.js caches through `env.customCache` ({ match, put }). We back it
// with our own bucket so `isModelCached` can answer "will this work offline?"
// (the HTTP cache it used before cannot be queried). Same mechanism as the ffmpeg
// and ZetaOffice engines: page-managed Cache API buckets.
//
// Everything here is best effort and never fails the model load: a read error is
// a cache miss, a write error only means "not saved offline" (see
// `modelCacheWriteDropped`).

import { Effect, Ref } from "effect";

import { ORT_CACHE_NAME } from "#/lib/offline/cache-names.ts";
import { ModelCacheError } from "./errors.ts";

export const MODEL_CACHE_NAME = "palico-model-v1";

// Files transformers.js fetches for RMBG-1.4 with dtype fp32.
const REQUIRED_MODEL_FILES = [
	"config.json",
	"preprocessor_config.json",
	"onnx/model.onnx",
] as const;

const openBucket = (name: string, op: "open" = "open") =>
	Effect.tryPromise({
		try: () => caches.open(name),
		catch: (cause) =>
			new ModelCacheError({
				op,
				message: cause instanceof Error ? cause.message : String(cause),
			}),
	});

// Set when a cache write failed (quota, private mode). The offline status shows
// "Not saved in this browser" instead of "Works offline".
const writeDroppedRef = Ref.unsafeMake(false);
export const modelCacheWriteDropped: Effect.Effect<boolean> =
	Ref.get(writeDroppedRef);

const matchModel = (key: string) =>
	openBucket(MODEL_CACHE_NAME).pipe(
		Effect.flatMap((cache) =>
			Effect.tryPromise({
				try: () => cache.match(key),
				catch: (cause) =>
					new ModelCacheError({
						op: "match",
						message: cause instanceof Error ? cause.message : String(cause),
					}),
			}),
		),
		// A read failure is a miss; transformers.js then downloads the file.
		Effect.catchAll(() => Effect.succeed(undefined)),
	);

const putModel = (key: string, response: Response) =>
	openBucket(MODEL_CACHE_NAME).pipe(
		Effect.flatMap((cache) =>
			Effect.tryPromise({
				try: () => cache.put(key, response),
				catch: (cause) =>
					new ModelCacheError({
						op: "put",
						message: cause instanceof Error ? cause.message : String(cause),
					}),
			}),
		),
		// Swallow so this session still works; remember it for the status UI.
		Effect.catchAll(() => Ref.set(writeDroppedRef, true)),
	);

// The one Promise-shaped seam: transformers.js calls these as plain async
// functions, so each runs its Effect once.
export const modelCache = {
	match: (key: string): Promise<Response | undefined> =>
		Effect.runPromise(matchModel(key)),
	put: (key: string, response: Response): Promise<void> =>
		Effect.runPromise(putModel(key, response)),
};

// Downloads the ORT files into their bucket (the service worker serves them from
// there offline). Skips files already stored. Failure is a ModelCacheError so the
// caller can decide; fetch errors surface the same way.
export const prefetchOrtAssets = (urls: readonly string[]) =>
	Effect.gen(function* () {
		const cache = yield* openBucket(ORT_CACHE_NAME);
		for (const url of urls) {
			const hit = yield* Effect.tryPromise({
				try: () => cache.match(url),
				catch: (cause) =>
					new ModelCacheError({ op: "match", message: String(cause) }),
			});
			if (hit) continue;
			yield* Effect.tryPromise({
				try: async () => {
					const res = await fetch(url);
					if (!res.ok) throw new Error(`${url} returned ${res.status}`);
					await cache.put(url, res);
				},
				catch: (cause) =>
					new ModelCacheError({
						op: "put",
						message: cause instanceof Error ? cause.message : String(cause),
					}),
			});
		}
	});

// True iff the weights, their config and both ORT files are all stored. Best
// effort: false when the Cache API is unavailable (private mode, old browsers).
export const isModelCached = (
	ortUrls: readonly string[],
): Effect.Effect<boolean> =>
	Effect.gen(function* () {
		if (typeof caches === "undefined") return false;
		const model = yield* openBucket(MODEL_CACHE_NAME);
		const ort = yield* openBucket(ORT_CACHE_NAME);
		const modelKeys = yield* Effect.tryPromise({
			try: () => model.keys(),
			catch: () => new ModelCacheError({ op: "match", message: "keys" }),
		});
		const hasModel = REQUIRED_MODEL_FILES.every((f) =>
			modelKeys.some((r) => new URL(r.url).pathname.endsWith(f)),
		);
		const ortHits = yield* Effect.tryPromise({
			try: () => Promise.all(ortUrls.map((u) => ort.match(u))),
			catch: () => new ModelCacheError({ op: "match", message: "ort" }),
		});
		return hasModel && ortHits.every((h) => h !== undefined);
	}).pipe(Effect.orElseSucceed(() => false));

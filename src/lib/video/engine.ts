// ffmpeg.wasm engine loader.
//
// CRITICAL: this module statically imports @ffmpeg/*. The /video-converter
// route must reach it only via `await import("#/lib/video/engine.ts")` inside
// a user-gesture handler, never via a top-level import. The 31MB engine
// download is what the consent gate (palico-rpj) exists to negotiate.

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { Effect, Option, Ref } from "effect";

import { m } from "#/paraglide/messages.js";

import {
	CACHE_NAME,
	ENGINE_ASSETS,
	type EngineAsset,
	type LoadPhase,
} from "./cache.ts";
import { EngineLoadError, EngineNotLoadedError } from "./errors.ts";

// Structural view of the loaded ffmpeg instance. Exposed instead of the
// `FFmpeg` class so converter.ts can stay type-only against this contract
// (no value-level @ffmpeg/* dependency at the type position).
type ProgressHandler = (e: { progress: number }) => void;

type LogHandler = (e: { type: string; message: string }) => void;

export interface EngineHandle {
	readonly readFile: (name: string) => Promise<Uint8Array | string>;
	readonly writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
	readonly deleteFile: (name: string) => Promise<boolean>;
	readonly exec: (args: string[]) => Promise<number>;
	readonly ffprobe: (args: string[]) => Promise<number>;
	readonly on: {
		(event: "progress", handler: ProgressHandler): void;
		(event: "log", handler: LogHandler): void;
	};
	readonly off: {
		(event: "progress", handler: ProgressHandler): void;
		(event: "log", handler: LogHandler): void;
	};
	readonly terminate: () => void;
}

// Module-singleton via Ref. Initialization is a constant; every read and
// write goes through Ref.get / Ref.set so the singleton stays inside the
// Effect graph instead of being a hidden mutable `let`.
const engineRef = Ref.makeUnsafe<Option.Option<EngineHandle>>(Option.none());

// Blob URLs backing the engine assets (~31MB of data pinned per set). Kept
// alive for the engine's whole lifetime — emscripten pthread workers can
// importScripts the core blob lazily at exec time, so revoking right after
// ffmpeg.load risks breaking later execs. Revoked in disposeEngine so every
// cancel → re-load cycle releases the previous set instead of leaking it.
const blobUrlsRef = Ref.makeUnsafe<ReadonlyArray<string>>([]);

const revokeTrackedBlobUrls: Effect.Effect<void> = Ref.getAndSet(
	blobUrlsRef,
	[],
).pipe(
	Effect.flatMap((urls) =>
		Effect.sync(() => {
			for (const url of urls) URL.revokeObjectURL(url);
		}),
	),
);

// Surfaces the loaded ffmpeg handle on the Effect channel. Fails with
// EngineNotLoadedError if the consent gate hasn't completed yet — callers
// can compose with `yield*` instead of nullable-handling at the call site.
export const getEngine: Effect.Effect<EngineHandle, EngineNotLoadedError> =
	Ref.get(engineRef).pipe(
		Effect.flatMap(
			Option.match({
				onNone: () =>
					Effect.fail(
						new EngineNotLoadedError({
							message: m.error_engine_not_loaded(),
						}),
					),
				onSome: (engine) => Effect.succeed(engine),
			}),
		),
	);

// Terminate and forget the engine. Best-effort — terminate throws if the
// instance was never loaded, but we want to land in `none()` regardless.
export const disposeEngine: Effect.Effect<void> = Effect.gen(function* () {
	const current = yield* Ref.get(engineRef);

	if (Option.isSome(current)) {
		yield* Effect.try({
			try: () => current.value.terminate(),
			catch: () => null,
		}).pipe(Effect.ignore);
		yield* Ref.set(engineRef, Option.none());
	}

	yield* revokeTrackedBlobUrls;
});

const emit = (
	onPhase: (phase: LoadPhase) => void,
	phase: LoadPhase,
): Effect.Effect<void> => Effect.sync(() => onPhase(phase));

// HEAD each missing asset to get Content-Length for an accurate aggregate %.
// jsdelivr serves Content-Length on HEAD; on the (rare) miss we fall back to
// 0 and the progress bar will jump on completion of that asset — acceptable.
const headSize = (asset: EngineAsset): Effect.Effect<number> =>
	Effect.tryPromise({
		try: () => fetch(asset.url, { method: "HEAD" }),
		catch: () => "head-failed" as const,
	}).pipe(
		Effect.map((res) =>
			Number.parseInt(res.headers.get("Content-Length") ?? "0", 10),
		),
		Effect.orElseSucceed(() => 0),
	);

// Stream-fetch with byte-level progress so the dialog can show "Downloading N%"
// against an aggregate total across all engine assets. Two Effect steps:
// (1) issue the request, validate the status; (2) drain the body and rebuild
// a Response we can both consume and Cache.put.
const fetchAssetWithProgress = (
	asset: EngineAsset,
	onBytes: (received: number) => void,
): Effect.Effect<Response, EngineLoadError> =>
	Effect.gen(function* () {
		const res = yield* Effect.tryPromise({
			try: () => fetch(asset.url),
			catch: (cause) =>
				new EngineLoadError({
					stage: "downloading",
					message:
						cause instanceof Error
							? cause.message
							: m.error_engine_download({ key: asset.key }),
				}),
		});

		if (!res.ok || !res.body) {
			return yield* new EngineLoadError({
				stage: "downloading",
				message: m.error_engine_http({
					key: asset.key,
					status: res.status,
				}),
			});
		}

		const body = res.body;

		return yield* Effect.tryPromise({
			try: async () => {
				const reader = body.getReader();
				const chunks: Uint8Array<ArrayBuffer>[] = [];
				let received = 0;

				while (true) {
					const { done, value } = await reader.read();

					if (done) break;
					chunks.push(value);
					received += value.length;
					onBytes(received);
				}

				const blob = new Blob(chunks, {
					type: asset.mime,
				});

				return new Response(blob, { headers: { "Content-Type": asset.mime } });
			},
			catch: (cause) =>
				new EngineLoadError({
					stage: "downloading",
					message:
						cause instanceof Error
							? cause.message
							: m.error_engine_stream({ key: asset.key }),
				}),
		});
	});

// Open the Cache API best-effort. None when unavailable (SSR, private mode,
// quota errors). Cache failures must never block the network path.
const openCache: Effect.Effect<Option.Option<Cache>> = Effect.gen(function* () {
	if (typeof caches === "undefined") return Option.none<Cache>();

	return yield* Effect.tryPromise({
		try: () => caches.open(CACHE_NAME),
		catch: () => "cache-open-failed" as const,
	}).pipe(
		Effect.map(Option.some<Cache>),
		Effect.orElseSucceed(() => Option.none<Cache>()),
	);
});

const peekCache = (
	cache: Cache,
	asset: EngineAsset,
): Effect.Effect<Option.Option<Response>> =>
	Effect.tryPromise({
		try: () => cache.match(asset.url),
		catch: () => "cache-match-failed" as const,
	}).pipe(
		Effect.map(Option.fromNullishOr),
		Effect.orElseSucceed(() => Option.none<Response>()),
	);

const putInCache = (
	cache: Cache,
	asset: EngineAsset,
	response: Response,
): Effect.Effect<void> =>
	Effect.tryPromise({
		try: () => cache.put(asset.url, response.clone()),
		// Quota/storage errors are non-fatal: the engine still works for this
		// session; the next visit will just re-download.
		catch: () => "cache-put-failed" as const,
	}).pipe(Effect.ignore);

const buildBlobUrl = (
	asset: EngineAsset,
	response: Response,
): Effect.Effect<string, EngineLoadError> =>
	Effect.tryPromise({
		try: () => response.blob(),
		catch: (cause) =>
			new EngineLoadError({
				stage: "preparing",
				message:
					cause instanceof Error
						? cause.message
						: m.error_engine_blob({ key: asset.key }),
			}),
	}).pipe(Effect.map((blob) => URL.createObjectURL(blob)));

const initFFmpeg = (
	responses: Map<string, Response>,
): Effect.Effect<EngineHandle, EngineLoadError> =>
	Effect.gen(function* () {
		const urls: Partial<Record<EngineAsset["key"], string>> = {};
		const created: string[] = [];

		// On any init failure, release the URLs minted so far — a failed init
		// must not pin 31MB of dead blobs until page unload.
		const revokeCreated = Effect.sync(() => {
			for (const url of created) URL.revokeObjectURL(url);
		});

		for (const asset of ENGINE_ASSETS) {
			const r = responses.get(asset.url);

			if (!r) {
				yield* revokeCreated;

				return yield* new EngineLoadError({
					stage: "preparing",
					message: m.error_engine_missing({ key: asset.key }),
				});
			}

			const url = yield* buildBlobUrl(asset, r).pipe(
				Effect.onError(() => revokeCreated),
			);

			created.push(url);
			urls[asset.key] = url;
		}

		const ffmpeg = new FFmpeg();
		yield* Effect.tryPromise({
			try: () =>
				ffmpeg.load({
					coreURL: urls.core,
					wasmURL: urls.wasm,
					workerURL: urls.worker,
				}),
			catch: (cause) =>
				new EngineLoadError({
					stage: "preparing",
					message:
						cause instanceof Error ? cause.message : m.error_engine_init(),
				}),
		}).pipe(Effect.onError(() => revokeCreated));

		yield* Ref.set(blobUrlsRef, created);

		return ffmpeg;
	});

export const loadEngine = (
	onPhase: (phase: LoadPhase) => void,
): Effect.Effect<EngineHandle, EngineLoadError> =>
	Effect.gen(function* () {
		const existing = yield* Ref.get(engineRef);

		if (Option.isSome(existing)) {
			yield* emit(onPhase, { kind: "ready" });

			return existing.value;
		}

		const maybeCache = yield* openCache;
		const responses = new Map<string, Response>();

		if (Option.isSome(maybeCache)) {
			const hits = yield* Effect.forEach(
				ENGINE_ASSETS,
				(asset) =>
					peekCache(maybeCache.value, asset).pipe(
						Effect.map((opt) => [asset, opt] as const),
					),
				{ concurrency: "unbounded" },
			);

			for (const [asset, opt] of hits) {
				if (Option.isSome(opt)) responses.set(asset.url, opt.value);
			}
		}

		const missing = ENGINE_ASSETS.filter((a) => !responses.has(a.url));

		if (missing.length > 0) {
			yield* emit(onPhase, { kind: "downloading", percent: 0 });

			const sizes = yield* Effect.forEach(missing, headSize, {
				concurrency: "unbounded",
			});

			const totalAll = sizes.reduce((s, n) => s + n, 0);
			const receivedPerAsset = new Map<string, number>();

			for (const asset of missing) {
				const fresh = yield* fetchAssetWithProgress(asset, (received) => {
					receivedPerAsset.set(asset.url, received);

					if (totalAll === 0) return;
					let sum = 0;

					for (const v of receivedPerAsset.values()) sum += v;
					const percent = Math.min(100, Math.round((sum / totalAll) * 100));
					onPhase({ kind: "downloading", percent });
				});

				responses.set(asset.url, fresh);
			}

			// Browsers evict HTTP cache aggressively; Cache API survives. Same
			// defensive pattern background-removal applies to its model files.
			yield* emit(onPhase, { kind: "caching" });

			if (Option.isSome(maybeCache)) {
				yield* Effect.forEach(
					missing,
					(asset) => {
						const r = responses.get(asset.url);

						return r ? putInCache(maybeCache.value, asset, r) : Effect.void;
					},
					{ concurrency: 1 },
				);
			}
		}

		yield* emit(onPhase, { kind: "preparing" });
		const engine = yield* initFFmpeg(responses);
		yield* Ref.set(engineRef, Option.some(engine));
		yield* emit(onPhase, { kind: "ready" });

		return engine;
	});

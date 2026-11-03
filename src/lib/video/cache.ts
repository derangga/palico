// Engine version and asset URLs for ffmpeg.wasm.
//
// Lives in its own module (separate from engine.ts) so the /video-converter
// route can static-import `isEngineCached` and `LoadPhase` without pulling
// @ffmpeg/* into the initial route bundle.

import { Effect, Schema } from "effect";

export const FFMPEG_CORE_VERSION = "0.12.10";

// Cache API name, versioned so a core bump invalidates old entries naturally.
export const CACHE_NAME = `ffmpeg-wasm-v${FFMPEG_CORE_VERSION}`;

// Multi-threaded core. Requires COOP/COEP (palico-a4u) so SharedArrayBuffer
// is available. Single-threaded core is 10-20× realtime — unusable for the
// file sizes this tool targets.
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@${FFMPEG_CORE_VERSION}/dist/esm`;

export const EngineAssetKey = Schema.Literals(["core", "wasm", "worker"]);
export type EngineAssetKey = Schema.Schema.Type<typeof EngineAssetKey>;

export const EngineAsset = Schema.Struct({
	key: EngineAssetKey,
	url: Schema.String,
	mime: Schema.String,
});
export type EngineAsset = Schema.Schema.Type<typeof EngineAsset>;

export const ENGINE_ASSETS: readonly EngineAsset[] = [
	{ key: "core", url: `${CDN_BASE}/ffmpeg-core.js`, mime: "text/javascript" },
	{
		key: "wasm",
		url: `${CDN_BASE}/ffmpeg-core.wasm`,
		mime: "application/wasm",
	},
	{
		key: "worker",
		url: `${CDN_BASE}/ffmpeg-core.worker.js`,
		mime: "text/javascript",
	},
];

// Approximate engine size shown to the user in the consent dialog.
// Sourced from the multi-threaded core distributed via jsdelivr.
export const ENGINE_SIZE_LABEL = "~31 MB";

// Discriminated union of UI states emitted while the engine loads. Modeled
// with Effect Schema so the shape is checkable and parseable; React consumes
// it via the `kind` discriminator. Kept here (not in engine.ts) so the route
// can name the type without static-importing @ffmpeg/*.
const PhaseChecking = Schema.Struct({ kind: Schema.Literal("checking") });
const PhaseConsent = Schema.Struct({ kind: Schema.Literal("consent") });
const PhaseDownloading = Schema.Struct({
	kind: Schema.Literal("downloading"),
	percent: Schema.Number,
});
const PhaseCaching = Schema.Struct({ kind: Schema.Literal("caching") });
const PhasePreparing = Schema.Struct({ kind: Schema.Literal("preparing") });
const PhaseReady = Schema.Struct({ kind: Schema.Literal("ready") });
const PhaseError = Schema.Struct({
	kind: Schema.Literal("error"),
	message: Schema.String,
});

export const LoadPhase = Schema.Union([
	PhaseChecking,
	PhaseConsent,
	PhaseDownloading,
	PhaseCaching,
	PhasePreparing,
	PhaseReady,
	PhaseError,
]);
export type LoadPhase = Schema.Schema.Type<typeof LoadPhase>;

// True iff every engine asset is already present in the Cache API. Used on
// route mount to decide whether the consent dialog must appear. Best-effort:
// returns `false` in any non-browser context or on any Cache API failure
// (Safari private mode, quota exhaustion, etc.).
//
// Errors are explicitly typed and discarded with `Effect.orElseSucceed` rather
// than swallowed inside an async try/catch.
export const isEngineCached: Effect.Effect<boolean> = Effect.gen(function* () {
	if (typeof caches === "undefined") return false;

	const cache = yield* Effect.tryPromise({
		try: () => caches.open(CACHE_NAME),
		catch: () => "cache-unavailable" as const,
	});

	const matches = yield* Effect.tryPromise({
		try: () =>
			Promise.all(ENGINE_ASSETS.map((asset) => cache.match(asset.url))),
		catch: () => "cache-match-failed" as const,
	});

	return matches.every((m) => m !== undefined);
}).pipe(Effect.orElseSucceed(() => false));

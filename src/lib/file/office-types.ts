import { Effect, Schema } from "effect";

// Shared constants + schemas for the Office → PDF tool. The heavy engine
// (LibreOffice compiled to WASM, distributed by ZetaOffice) is loaded lazily on
// first use; typed orchestration lives in src/lib/file/office.ts and the DOM
// loader in src/lib/file/office-engine.ts.
//
// This module deliberately holds NO value-level dependency on `zetajs` so the
// /office-to-pdf route can static-import `LoadPhase` and `isEngineCached`
// without pulling the office runtime (and, indirectly, the ~53 MB WASM boot
// path) into the initial route bundle.

export const MB = 1024 * 1024;

// --- Limits (OOM guards) ----------------------------------------------------
// LibreOffice holds the whole document model in memory while it renders to PDF,
// and a small compressed .docx can expand dramatically. These caps keep peak
// memory bounded; the batch is converted sequentially (one file at a time) so
// peak ≈ one file, not the whole queue.

// Per-file byte cap. Enforced on the main thread before the file reaches the
// engine, surfaced as OfficeTooLargeError.
export const MAX_OFFICE_BYTES = 25 * MB;

// Soft upper bound on how many files one batch may hold, so a single run can't
// spawn an unbounded amount of sequential work. Surfaced as
// OfficeBatchTooLargeError.
export const MAX_BATCH_FILES = 20;

// Combined size cap across a batch. Even under the per-file and count caps, a
// large number of near-cap files would still add up; this bounds the total.
export const MAX_BATCH_BYTES = 100 * MB;

// --- Supported input formats ------------------------------------------------
// Extensions LibreOffice will convert to PDF here. Lowercase, no dot. Kept as a
// readonly tuple so the set is a single source of truth for the dropzone
// `accept` list, the MIME hints, and validation.
export const SUPPORTED_OFFICE_EXTENSIONS = [
	"docx",
	"doc",
	"odt",
	"rtf",
] as const;
export type OfficeExtension = (typeof SUPPORTED_OFFICE_EXTENSIONS)[number];

// `accept` attribute value for the file input (extension-based; MIME types for
// these formats are inconsistent across browsers/OSes).
export const OFFICE_ACCEPT = SUPPORTED_OFFICE_EXTENSIONS.map(
	(ext) => `.${ext}`,
).join(",");

// --- Engine assets (ZetaOffice CDN) -----------------------------------------
// Verified live sizes/headers (2026-07): every asset sends
// `access-control-allow-origin: *` AND `cross-origin-resource-policy:
// cross-origin`, so they load under the site's COEP `require-corp`
// (src/server.ts) with no self-hosting needed. CDN `cache-control` is only
// max-age=1200s, so persistence relies on the Cache API (see office-engine.ts),
// mirroring the video engine and background-removal model files.
export const ZETA_WASM_PKG = "free" as const;
export const ZETA_CDN_BASE = "https://cdn.zetaoffice.net/zetaoffice_latest/";

// Cache API bucket. Versioned by the CDN channel so switching channels (or a
// future pin) invalidates stale entries naturally.
export const OFFICE_CACHE_NAME = `zetaoffice-wasm-${ZETA_WASM_PKG}`;

export const OfficeAssetKey = Schema.Literals(["js", "wasm", "data"]);
export type OfficeAssetKey = Schema.Schema.Type<typeof OfficeAssetKey>;

export const OfficeEngineAsset = Schema.Struct({
	key: OfficeAssetKey,
	url: Schema.String,
	mime: Schema.String,
});
export type OfficeEngineAsset = Schema.Schema.Type<typeof OfficeEngineAsset>;

export const OFFICE_ENGINE_ASSETS: readonly OfficeEngineAsset[] = [
	{ key: "js", url: `${ZETA_CDN_BASE}soffice.js`, mime: "text/javascript" },
	{
		key: "wasm",
		url: `${ZETA_CDN_BASE}soffice.wasm`,
		mime: "application/wasm",
	},
	{
		key: "data",
		url: `${ZETA_CDN_BASE}soffice.data`,
		mime: "application/octet-stream",
	},
];

// Approximate engine size shown in the consent dialog. Sum of the three assets
// above (~0.86 + 36.3 + 15.9 MB), rounded for display.
export const OFFICE_ENGINE_SIZE_LABEL = "~53 MB";

// --- Engine load phases (UI states) -----------------------------------------
// Discriminated union of states emitted while the engine loads. Modeled with
// Schema so the shape is checkable; React consumes it via the `kind`
// discriminator. Kept here (not in office-engine.ts) so the route can name the
// type without static-importing the office runtime.
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
// (Safari private mode, quota exhaustion, etc.). Errors are explicitly typed
// and discarded with `Effect.orElseSucceed` rather than swallowed in try/catch.
export const isEngineCached: Effect.Effect<boolean> = Effect.gen(function* () {
	if (typeof caches === "undefined") return false;

	const cache = yield* Effect.tryPromise({
		try: () => caches.open(OFFICE_CACHE_NAME),
		catch: () => "cache-unavailable" as const,
	});

	const matches = yield* Effect.tryPromise({
		try: () =>
			Promise.all(OFFICE_ENGINE_ASSETS.map((asset) => cache.match(asset.url))),
		catch: () => "cache-match-failed" as const,
	});

	return matches.every((m) => m !== undefined);
}).pipe(Effect.orElseSucceed(() => false));

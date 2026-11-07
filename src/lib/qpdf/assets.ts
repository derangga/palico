// The qpdf engine's files and "is it saved on this device?" check. qpdf is the
// open-source PDF tool compiled to WebAssembly by @neslinesli93/qpdf-wasm. This is
// the one place that knows where the wasm lives, so the PDF password tool and any
// later tool that needs qpdf (a lossless compression pass, say) share one download
// and one cache bucket.
//
// This module holds no value-level dependency on the qpdf glue code, only the
// wasm's URL, so a route can import it without pulling the engine into its bundle.

// `?url` gives the hashed same-origin URL and does not load the file. The package
// has no `exports` map, so the dist path resolves. The URL is stable for a build,
// which makes it the Cache API key.
import qpdfWasmUrl from "@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url";
import { Effect, Schema } from "effect";

import { QPDF_CACHE_NAME } from "#/lib/offline/cache-names.ts";

export { QPDF_CACHE_NAME };

export const QPDF_WASM_URL: string = qpdfWasmUrl;

// Size of qpdf.wasm in 0.3.1 (1.33 MB; about 0.44 MB gzipped on the wire). Used for
// the download percentage, because a compressed response reports its compressed
// length while the stream we read is the decoded one.
export const QPDF_WASM_BYTES = 1_334_286;

// Shown in the consent dialog and the offline pill.
export const QPDF_SIZE_LABEL = "~1.3 MB";

// The qpdf engine has no separate boot step (each job instantiates the wasm in its
// own worker), so a load goes checking, consent, downloading, caching, ready.
// Modeled with Schema like the other engines' phases; React reads `kind`.
const PhaseChecking = Schema.Struct({ kind: Schema.Literal("checking") });
const PhaseConsent = Schema.Struct({ kind: Schema.Literal("consent") });

const PhaseDownloading = Schema.Struct({
	kind: Schema.Literal("downloading"),
	percent: Schema.Number,
});

const PhaseCaching = Schema.Struct({ kind: Schema.Literal("caching") });
const PhaseReady = Schema.Struct({ kind: Schema.Literal("ready") });

const PhaseError = Schema.Struct({
	kind: Schema.Literal("error"),
	message: Schema.String,
});

export const QpdfLoadPhase = Schema.Union([
	PhaseChecking,
	PhaseConsent,
	PhaseDownloading,
	PhaseCaching,
	PhaseReady,
	PhaseError,
]);

export type QpdfLoadPhase = Schema.Schema.Type<typeof QpdfLoadPhase>;

// True when the wasm is in its Cache API bucket. Best effort: false when the Cache
// API is missing or throws (Safari private mode), so the gate asks for consent.
export const isQpdfCached: Effect.Effect<boolean> = Effect.gen(function* () {
	if (typeof caches === "undefined") return false;

	const cache = yield* Effect.tryPromise({
		try: () => caches.open(QPDF_CACHE_NAME),
		catch: () => "cache-unavailable" as const,
	});

	const hit = yield* Effect.tryPromise({
		try: () => cache.match(QPDF_WASM_URL),
		catch: () => "cache-match-failed" as const,
	});

	return hit !== undefined;
}).pipe(Effect.orElseSucceed(() => false));

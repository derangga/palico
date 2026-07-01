// LibreOffice (ZetaOffice) WASM engine loader for the Office → PDF tool.
//
// CRITICAL: ZetaHelperMain requires the DOM (a hidden #qtcanvas, window,
// document.body) and boots LibreOffice's own Qt/pthread worker. It therefore
// runs on the MAIN THREAD, not in a module Web Worker. The route must reach
// this module only via `await import(...)` inside a user-gesture handler, never
// a top-level import — the ~53 MB engine download is what the consent gate
// negotiates.
//
// The vendored runtime (public/vendor/zetajs/*) is loaded by URL, not through
// the bundler, because zetaHelper.js resolves sibling scripts from its own
// import.meta.url. We pre-fetch the three heavy assets ourselves (with byte
// progress, persisted in the Cache API) and hand them to Emscripten as blob
// URLs via the `globalThis.__palicoZetaAssets` map the vendored file consults.

import { Effect, Option, Ref } from "effect";

import { OfficeConvertError, OfficeEngineLoadError } from "./errors.ts";
import {
	type LoadPhase,
	OFFICE_CACHE_NAME,
	OFFICE_ENGINE_ASSETS,
	type OfficeEngineAsset,
} from "./office-types.ts";

// Vendored runtime, served verbatim (see vite.config.ts serveVendorStatic + the
// Cloudflare static-asset host in prod). Loaded by URL, never bundled.
const ZETA_HELPER_URL = "/vendor/zetajs/zetaHelper.js";
const OFFICE_THREAD_URL = "/vendor/zetajs/office_thread.js";

// Emscripten's in-memory filesystem, installed on `window.FS` by soffice.js.
interface EmscriptenFS {
	readonly writeFile: (path: string, data: Uint8Array) => void;
	readonly readFile: (path: string) => Uint8Array;
	readonly unlink: (path: string) => void;
}

// A message port to LibreOffice's office thread. We set a single dispatcher on
// it (in loadEngine) and route replies to the in-flight conversion.
interface ThreadPort {
	postMessage: (message: unknown) => void;
	onmessage: ((event: MessageEvent) => void) | null;
}

// Minimal structural view of a booted ZetaHelperMain, enough to drive convert.
interface EngineHandle {
	readonly thrPort: ThreadPort;
	readonly fs: EmscriptenFS;
}

// Reply shapes posted back by office_thread.js.
type OfficeThreadReply =
	| { readonly cmd: "start" }
	| { readonly cmd: "converted"; readonly id: string; readonly to: string }
	| { readonly cmd: "error"; readonly id: string; readonly message: string };

// Module singleton via Ref (per Effect patterns — no hidden mutable `let`).
const engineRef = Ref.unsafeMake<Option.Option<EngineHandle>>(Option.none());

// Conversions are sequential (the batch runs one file at a time), so a single
// pending slot suffices. Reset between conversions.
let pendingConvert: ((reply: OfficeThreadReply) => void) | null = null;

const emit = (
	onPhase: (phase: LoadPhase) => void,
	phase: LoadPhase,
): Effect.Effect<void> => Effect.sync(() => onPhase(phase));

// --- Cache API (best-effort persistence) ------------------------------------

const openCache: Effect.Effect<Option.Option<Cache>> = Effect.gen(function* () {
	if (typeof caches === "undefined") return Option.none<Cache>();
	return yield* Effect.tryPromise({
		try: () => caches.open(OFFICE_CACHE_NAME),
		catch: () => "cache-open-failed" as const,
	}).pipe(
		Effect.map(Option.some<Cache>),
		Effect.orElseSucceed(() => Option.none<Cache>()),
	);
});

const peekCache = (
	cache: Cache,
	asset: OfficeEngineAsset,
): Effect.Effect<Option.Option<Response>> =>
	Effect.tryPromise({
		try: () => cache.match(asset.url),
		catch: () => "cache-match-failed" as const,
	}).pipe(
		Effect.map(Option.fromNullable),
		Effect.orElseSucceed(() => Option.none<Response>()),
	);

const putInCache = (
	cache: Cache,
	asset: OfficeEngineAsset,
	response: Response,
): Effect.Effect<void> =>
	Effect.tryPromise({
		try: () => cache.put(asset.url, response.clone()),
		catch: () => "cache-put-failed" as const,
	}).pipe(Effect.ignore);

// HEAD each missing asset for an accurate aggregate download %. On the rare miss
// we fall back to 0 and the bar jumps on that asset's completion — acceptable.
const headSize = (asset: OfficeEngineAsset): Effect.Effect<number> =>
	Effect.tryPromise({
		try: () => fetch(asset.url, { method: "HEAD" }),
		catch: () => "head-failed" as const,
	}).pipe(
		Effect.map((res) =>
			Number.parseInt(res.headers.get("Content-Length") ?? "0", 10),
		),
		Effect.orElseSucceed(() => 0),
	);

// Stream-fetch one asset with byte-level progress, rebuilding a Response we can
// both cache and turn into a blob URL.
const fetchAssetWithProgress = (
	asset: OfficeEngineAsset,
	onBytes: (received: number) => void,
): Effect.Effect<Response, OfficeEngineLoadError> =>
	Effect.gen(function* () {
		const res = yield* Effect.tryPromise({
			try: () => fetch(asset.url),
			catch: (cause) =>
				new OfficeEngineLoadError({
					stage: "downloading",
					message:
						cause instanceof Error
							? cause.message
							: `Failed to download ${asset.key}.`,
				}),
		});

		if (!res.ok || !res.body) {
			return yield* new OfficeEngineLoadError({
				stage: "downloading",
				message: `Failed to download ${asset.key} (HTTP ${res.status}).`,
			});
		}
		const body = res.body;

		return yield* Effect.tryPromise({
			try: async () => {
				const reader = body.getReader();
				const chunks: Uint8Array[] = [];
				let received = 0;
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					chunks.push(value);
					received += value.length;
					onBytes(received);
				}
				const blob = new Blob(chunks as unknown as BlobPart[], {
					type: asset.mime,
				});
				return new Response(blob, { headers: { "Content-Type": asset.mime } });
			},
			catch: (cause) =>
				new OfficeEngineLoadError({
					stage: "downloading",
					message:
						cause instanceof Error
							? cause.message
							: `Failed to stream ${asset.key}.`,
				}),
		});
	});

const buildBlobUrl = (
	asset: OfficeEngineAsset,
	response: Response,
): Effect.Effect<string, OfficeEngineLoadError> =>
	Effect.tryPromise({
		try: () => response.blob(),
		catch: (cause) =>
			new OfficeEngineLoadError({
				stage: "preparing",
				message:
					cause instanceof Error
						? cause.message
						: `Failed to read ${asset.key} blob.`,
			}),
	}).pipe(Effect.map((blob) => URL.createObjectURL(blob)));

// Gather every engine asset (cache-first, else download with progress), publish
// the results as blob URLs on the global map the vendored zetaHelper consults.
//
// NOTE on concurrency: the `Effect.forEach`s below iterate OFFICE_ENGINE_ASSETS
// (a fixed set of exactly 3 engine files: soffice.js/.wasm/.data) — NOT the
// user's documents. So `concurrency: "unbounded"` means "at most 3 in parallel",
// and only for cheap ops (Cache API peeks + HEAD requests). The heavy byte
// download happens one asset at a time in the sequential `for` loop below. This
// runs once per session at engine load, independent of how many documents are
// converted; document conversion itself is strictly sequential (see convertToPdf).
const prepareAssets = (
	onPhase: (phase: LoadPhase) => void,
): Effect.Effect<void, OfficeEngineLoadError> =>
	Effect.gen(function* () {
		const maybeCache = yield* openCache;
		const responses = new Map<string, Response>();

		if (Option.isSome(maybeCache)) {
			const hits = yield* Effect.forEach(
				OFFICE_ENGINE_ASSETS,
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

		const missing = OFFICE_ENGINE_ASSETS.filter((a) => !responses.has(a.url));

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

		// Publish blob URLs keyed by bare filename (the `path` Emscripten passes
		// to locateFile, e.g. "soffice.wasm").
		const map: Record<string, string> = {};
		for (const asset of OFFICE_ENGINE_ASSETS) {
			const r = responses.get(asset.url);
			if (!r) {
				return yield* new OfficeEngineLoadError({
					stage: "preparing",
					message: `Engine asset "${asset.key}" is missing after download.`,
				});
			}
			const fileName = asset.url.slice(asset.url.lastIndexOf("/") + 1);
			map[fileName] = yield* buildBlobUrl(asset, r);
		}
		(
			globalThis as { __palicoZetaAssets?: Record<string, string> }
		).__palicoZetaAssets = map;
	});

// Structural view of the dynamically-imported ZetaHelperMain constructor.
interface ZetaHelperMainCtor {
	new (
		threadJs: string,
		options: { threadJsType: "module" | "classic"; wasmPkg: string },
	): {
		thrPort: ThreadPort;
		start: (appInit: () => void) => void;
	};
}

// Boot ZetaHelperMain and resolve once the office thread reports ready. Sets the
// single message dispatcher that routes convert replies to `pendingConvert`.
const bootEngine: Effect.Effect<EngineHandle, OfficeEngineLoadError> =
	Effect.gen(function* () {
		const mod = yield* Effect.tryPromise({
			try: () =>
				import(/* @vite-ignore */ ZETA_HELPER_URL) as Promise<{
					ZetaHelperMain: ZetaHelperMainCtor;
				}>,
			catch: (cause) =>
				new OfficeEngineLoadError({
					stage: "preparing",
					message:
						cause instanceof Error
							? cause.message
							: "Failed to load the office runtime.",
				}),
		});

		return yield* Effect.async<EngineHandle, OfficeEngineLoadError>(
			(resume) => {
				const zHM = new mod.ZetaHelperMain(OFFICE_THREAD_URL, {
					threadJsType: "module",
					wasmPkg: "free",
				});
				zHM.start(() => {
					zHM.thrPort.onmessage = (event: MessageEvent) => {
						const reply = event.data as OfficeThreadReply;
						if (reply.cmd === "start") {
							const fs = (globalThis as { FS?: EmscriptenFS }).FS;
							if (!fs) {
								resume(
									Effect.fail(
										new OfficeEngineLoadError({
											stage: "preparing",
											message: "Emscripten FS was not available after boot.",
										}),
									),
								);
								return;
							}
							resume(Effect.succeed({ thrPort: zHM.thrPort, fs }));
							return;
						}
						// convert replies -> route to the in-flight conversion.
						pendingConvert?.(reply);
					};
				});
			},
		);
	});

// Load the engine (cache-first assets, then boot). Idempotent: returns the
// existing handle if already loaded. `onPhase` drives the consent/progress UI.
export const loadEngine = (
	onPhase: (phase: LoadPhase) => void,
): Effect.Effect<EngineHandle, OfficeEngineLoadError> =>
	Effect.gen(function* () {
		const existing = yield* Ref.get(engineRef);
		if (Option.isSome(existing)) {
			yield* emit(onPhase, { kind: "ready" });
			return existing.value;
		}

		yield* prepareAssets(onPhase);
		yield* emit(onPhase, { kind: "preparing" });
		const engine = yield* bootEngine;
		yield* Ref.set(engineRef, Option.some(engine));
		yield* emit(onPhase, { kind: "ready" });
		return engine;
	});

// True once the engine singleton is booted this session.
export const isEngineReady: Effect.Effect<boolean> = Ref.get(engineRef).pipe(
	Effect.map(Option.isSome),
);

// Convert one document's bytes to PDF bytes via the booted engine. Writes the
// input to a canonical /tmp path (preserving the extension so LO can sniff the
// type), asks the office thread to convert, and awaits the reply. Sequential by
// contract — the caller (office.ts batch) never overlaps conversions.
export const convertToPdf = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly ext: string;
	readonly bytes: Uint8Array;
}): Effect.Effect<Uint8Array, OfficeConvertError> =>
	Effect.gen(function* () {
		const maybeEngine = yield* Ref.get(engineRef);
		const engine = yield* Option.match(maybeEngine, {
			onNone: () =>
				Effect.fail(
					new OfficeConvertError({
						fileName: params.fileName,
						message: "Engine is not loaded.",
					}),
				),
			onSome: (e) => Effect.succeed(e),
		});

		const from = `/tmp/input_${params.id}.${params.ext}`;
		const to = `/tmp/output_${params.id}.pdf`;

		return yield* Effect.async<Uint8Array, OfficeConvertError>((resume) => {
			pendingConvert = (reply) => {
				pendingConvert = null;
				if (reply.cmd === "error") {
					resume(
						Effect.fail(
							new OfficeConvertError({
								fileName: params.fileName,
								message: reply.message,
							}),
						),
					);
					return;
				}
				if (reply.cmd === "converted") {
					try {
						const pdf = engine.fs.readFile(to);
						// Copy off the FS buffer before unlinking, then clean up both
						// files so a long batch can't accumulate memory.
						const copy = new Uint8Array(pdf);
						try {
							engine.fs.unlink(from);
						} catch {}
						try {
							engine.fs.unlink(to);
						} catch {}
						resume(Effect.succeed(copy));
					} catch (cause) {
						resume(
							Effect.fail(
								new OfficeConvertError({
									fileName: params.fileName,
									message:
										cause instanceof Error
											? cause.message
											: "Failed to read converted PDF.",
								}),
							),
						);
					}
				}
			};

			try {
				engine.fs.writeFile(from, params.bytes);
			} catch (cause) {
				pendingConvert = null;
				resume(
					Effect.fail(
						new OfficeConvertError({
							fileName: params.fileName,
							message:
								cause instanceof Error
									? cause.message
									: "Failed to stage input file.",
						}),
					),
				);
				return;
			}
			engine.thrPort.postMessage({
				cmd: "convert",
				id: params.id,
				name: params.fileName,
				from,
				to,
			});
		});
	});

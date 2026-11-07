// Page-side loader for the qpdf engine: downloads the self-hosted wasm once, with
// progress, and keeps it in the Cache API so every later job (and every later
// visit, offline included) reads it from there. Job workers do the actual
// instantiating (see run.ts), so there is nothing to boot here.
//
// Wrap the call in `guardedEngineLoad("qpdf", ...)` (src/lib/offline/gate.ts) for
// the storage pre-check, the busy marker and the "was it really kept" check.

import { Effect } from "effect";

import { m } from "#/paraglide/messages.js";

import {
	isQpdfCached,
	QPDF_CACHE_NAME,
	QPDF_WASM_BYTES,
	QPDF_WASM_URL,
	type QpdfLoadPhase,
} from "./assets.ts";
import { PdfEngineLoadError } from "./errors.ts";

const messageOf = (cause: unknown, fallback: string) =>
	cause instanceof Error && cause.message !== "" ? cause.message : fallback;

// Stream the wasm with byte progress. The response is rebuilt from the collected
// bytes so it can go into the cache.
const download = (
	onPhase: (phase: QpdfLoadPhase) => void,
): Effect.Effect<Response, PdfEngineLoadError> =>
	Effect.gen(function* () {
		const res = yield* Effect.tryPromise({
			try: () => fetch(QPDF_WASM_URL),
			catch: (cause) =>
				new PdfEngineLoadError({
					stage: "downloading",
					message: messageOf(cause, m.error_qpdf_download()),
				}),
		});

		if (!res.ok || !res.body) {
			return yield* new PdfEngineLoadError({
				stage: "downloading",
				message: m.error_qpdf_http({ status: res.status }),
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
					onPhase({
						kind: "downloading",
						percent: Math.min(
							99,
							Math.round((received / QPDF_WASM_BYTES) * 100),
						),
					});
				}

				return new Response(new Blob(chunks), {
					headers: { "Content-Type": "application/wasm" },
				});
			},
			catch: (cause) =>
				new PdfEngineLoadError({
					stage: "downloading",
					message: messageOf(cause, m.error_qpdf_download()),
				}),
		});
	});

// A failed write only means "not saved for offline": the first job still runs from
// the network, and `afterDownload` turns the pill to "Not saved on this device".
const store = (response: Response): Effect.Effect<void> =>
	Effect.tryPromise({
		try: async () => {
			const cache = await caches.open(QPDF_CACHE_NAME);
			await cache.put(QPDF_WASM_URL, response);
		},
		catch: () => "cache-put-failed" as const,
	}).pipe(Effect.ignore);

// Make the engine ready: nothing to do when it is already stored, otherwise
// download and store it. `onPhase` drives the consent card's progress.
export const loadQpdfEngine = (
	onPhase: (phase: QpdfLoadPhase) => void,
): Effect.Effect<void, PdfEngineLoadError> =>
	Effect.gen(function* () {
		if (yield* isQpdfCached) {
			onPhase({ kind: "ready" });

			return;
		}

		onPhase({ kind: "downloading", percent: 0 });
		const response = yield* download(onPhase);
		onPhase({ kind: "caching" });

		if (typeof caches !== "undefined") yield* store(response);
		onPhase({ kind: "ready" });
	});

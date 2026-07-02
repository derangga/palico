import { Effect } from "effect";

import {
	EncryptedPdfError,
	InvalidPdfError,
	type PdfLoadError,
	PdfTooManyPagesError,
	PdfWorkerError,
} from "./errors.ts";
import {
	MAX_PDF_PAGES,
	type PdfThumbnail,
	type PdfWorkerRequest,
	type PdfWorkerResponse,
	type RenderedPdf,
	type SplitPart,
} from "./pdf-types.ts";

// How a worker message is dispatched by the generic runner. A handler inspects
// each response and returns one of:
//   Succeed(value) — the job is done; resume the Effect with `value`.
//   Continue       — a streaming intermediate (render's "meta"/"page"); keep
//                    listening for more messages.
//   Unhandled      — this response isn't part of this job's happy path; the
//                    runner then maps "error" responses to typed errors and
//                    fails on anything else so the Effect can never hang.
type JobResult<A> =
	| { readonly _tag: "Succeed"; readonly value: A }
	| { readonly _tag: "Continue" }
	| { readonly _tag: "Unhandled" };

const Continue = { _tag: "Continue" } as const;
const Unhandled = { _tag: "Unhandled" } as const;
const Succeed = <A>(value: A): JobResult<A> => ({ _tag: "Succeed", value });

// Every genuine response our worker posts is an object carrying one of these
// string `type`s (see PdfWorkerResponse). The worker channel can also surface
// foreign messages we didn't send — dev-tooling/HMR chatter or nested-worker
// plumbing (pdf.js spawns its own core worker) — which arrive with no `type`.
// We ignore those instead of failing the job on them.
const WORKER_RESPONSE_TYPES = new Set<string>([
	"meta",
	"page",
	"done",
	"extracted",
	"zipped",
	"merged",
	"error",
]);

const isPdfWorkerResponse = (data: unknown): data is PdfWorkerResponse =>
	typeof data === "object" &&
	data !== null &&
	"type" in data &&
	typeof (data as { type: unknown }).type === "string" &&
	WORKER_RESPONSE_TYPES.has((data as { type: string }).type);

// Single generic worker driver shared by all four public functions. Spins up a
// one-shot worker, transfers the request payload in, and resolves once via the
// `handle` matcher. Termination is guaranteed by acquireUseRelease (success,
// failure, and interrupt all terminate the worker). Error mapping and the
// unexpected-response guard live here so every op reacts to the same failure
// modes and no op can silently hang on an unmatched message.
const runWorkerJob = <A>(
	fileName: string,
	request: PdfWorkerRequest,
	transfer: ReadonlyArray<Transferable>,
	handle: (res: PdfWorkerResponse) => JobResult<A>,
): Effect.Effect<A, PdfLoadError> =>
	Effect.acquireUseRelease(
		Effect.sync(
			() =>
				// The `new URL(...)` MUST stay inline inside `new Worker(...)` so Vite's
				// static analysis detects and bundles the worker (see image-converter
				// worker-client for the cautionary tale).
				new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), {
					type: "module",
				}),
		),
		(worker) =>
			Effect.async<A, PdfLoadError>((resume) => {
				worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
					const res = event.data;
					// Ignore foreign/noise messages (dev-tooling, nested pdf.js worker)
					// that aren't our responses — failing on them would spuriously abort
					// an otherwise-healthy job. Genuine terminal messages still arrive and
					// resolve the Effect, so this cannot hang.
					if (!isPdfWorkerResponse(res)) return;
					const result = handle(res);
					if (result._tag === "Succeed") {
						resume(Effect.succeed(result.value));
						return;
					}
					if (result._tag === "Continue") return;
					// Unhandled by this op: map a reported error to its tagged type, and
					// fail on any other unexpected response rather than leaving the
					// Effect (and worker) hanging forever.
					if (res.type === "error") {
						resume(Effect.fail(toTypedError(fileName, res)));
					} else {
						resume(
							Effect.fail(
								new PdfWorkerError({
									fileName,
									message: `Unexpected PDF worker response: "${res.type}".`,
								}),
							),
						);
					}
				};
				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new PdfWorkerError({
								fileName,
								message: event.message || "PDF worker crashed.",
							}),
						),
					);
				};

				worker.postMessage(request, [...transfer]);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
	);

// Spin up a one-shot worker, transfer the PDF bytes in, and stream the rendered
// page thumbnails back. `onThumbnail` fires per page for progressive UI; the
// Effect resolves once with the full set.
export const renderPdfThumbnails = (
	params: {
		readonly id: string;
		readonly fileName: string;
		readonly buffer: ArrayBuffer;
		readonly maxPages: number;
		readonly thumbnailWidth: number;
		readonly thumbnailLimit?: number;
	},
	onThumbnail: (thumbnail: PdfThumbnail) => void,
): Effect.Effect<RenderedPdf, PdfLoadError> =>
	// Fresh accumulators per execution (suspend defers them until the Effect runs).
	Effect.suspend(() => {
		const thumbnails: PdfThumbnail[] = [];
		let pageCount = 0;
		return runWorkerJob<RenderedPdf>(
			params.fileName,
			{
				type: "render",
				id: params.id,
				buffer: params.buffer,
				maxPages: params.maxPages,
				thumbnailWidth: params.thumbnailWidth,
				thumbnailLimit: params.thumbnailLimit,
			},
			[params.buffer],
			(res) => {
				switch (res.type) {
					case "meta":
						pageCount = res.pageCount;
						return Continue;
					case "page": {
						const thumbnail: PdfThumbnail = {
							index: res.index,
							bitmap: res.bitmap,
							width: res.width,
							height: res.height,
						};
						thumbnails.push(thumbnail);
						onThumbnail(thumbnail);
						return Continue;
					}
					case "done":
						return Succeed({ pageCount, thumbnails });
					default:
						return Unhandled;
				}
			},
		);
	});

// Spin up a one-shot worker, transfer the PDF bytes in, and copy the requested
// pages into a new PDF. Resolves with the new document's bytes.
export const extractPdfPages = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
	readonly pageIndices: ReadonlyArray<number>;
}): Effect.Effect<ArrayBuffer, PdfLoadError> =>
	runWorkerJob<ArrayBuffer>(
		params.fileName,
		{
			type: "extract",
			id: params.id,
			buffer: params.buffer,
			pageIndices: [...params.pageIndices],
		},
		[params.buffer],
		(res) => (res.type === "extracted" ? Succeed(res.bytes) : Unhandled),
	);

// Spin up a one-shot worker, transfer the PDF bytes in, and split it into the
// given parts, bundled as a single zip. Resolves with the zip bytes.
export const splitPdfToZip = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
	readonly parts: ReadonlyArray<SplitPart>;
}): Effect.Effect<ArrayBuffer, PdfLoadError> =>
	runWorkerJob<ArrayBuffer>(
		params.fileName,
		{
			type: "split",
			id: params.id,
			buffer: params.buffer,
			parts: params.parts,
		},
		[params.buffer],
		(res) => (res.type === "zipped" ? Succeed(res.bytes) : Unhandled),
	);

// Spin up a one-shot worker, transfer every PDF's bytes in, and concatenate all
// their pages (in array order) into a single PDF. Resolves with the merged
// document's bytes.
export const mergePdfFiles = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffers: ReadonlyArray<ArrayBuffer>;
}): Effect.Effect<ArrayBuffer, PdfLoadError> =>
	runWorkerJob<ArrayBuffer>(
		params.fileName,
		{
			type: "merge",
			id: params.id,
			buffers: [...params.buffers],
		},
		[...params.buffers],
		(res) => (res.type === "merged" ? Succeed(res.bytes) : Unhandled),
	);

const toTypedError = (
	fileName: string,
	res: Extract<PdfWorkerResponse, { type: "error" }>,
): PdfLoadError => {
	switch (res.reason) {
		case "encrypted":
			return new EncryptedPdfError({ fileName, message: res.message });
		case "too-many-pages":
			return new PdfTooManyPagesError({
				fileName,
				pages: res.pageCount ?? 0,
				limit: MAX_PDF_PAGES,
				message: res.message,
			});
		case "worker":
			return new PdfWorkerError({ fileName, message: res.message });
		default:
			return new InvalidPdfError({ fileName, message: res.message });
	}
};

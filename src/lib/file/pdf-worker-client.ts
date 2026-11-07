import { Data, Effect, Schema } from "effect";

import type { MetadataReport } from "#/lib/metadata/types.ts";
import { m } from "#/paraglide/messages.js";

import {
	EncryptedPdfError,
	InvalidPdfError,
	PdfCompressError,
	type PdfLoadError,
	PdfRasterBudgetError,
	PdfTooManyPagesError,
	PdfWorkerError,
} from "./errors.ts";
import type { CompressPresetId } from "./pdf-compress-presets.ts";
import {
	type CompressStats,
	MAX_PDF_PAGES,
	type PdfThumbnail,
	type PdfWorkerRequest,
	type PdfWorkerResponse,
	type RasterDpi,
	type RasterFormat,
	type RenderedPdf,
	type Rotation,
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
type JobResult<A> = Data.TaggedEnum<{
	Succeed: { readonly value: A };
	Continue: {};
	Unhandled: {};
}>;

interface JobResultDef extends Data.TaggedEnum.WithGenerics<1> {
	readonly taggedEnum: JobResult<this["A"]>;
}

const JobResult = Data.taggedEnum<JobResultDef>();
const Continue = JobResult.Continue();
const Unhandled = JobResult.Unhandled();
const Succeed = <A>(value: A): JobResult<A> => JobResult.Succeed({ value });

// Every genuine response our worker posts is an object carrying one of these
// string `type`s (see PdfWorkerResponse). The worker channel can also surface
// foreign messages we didn't send — dev-tooling/HMR chatter or nested-worker
// plumbing (pdf.js spawns its own core worker) — which arrive with no `type`.
// We ignore those instead of failing the job on them.
// Only the `type` tag is checked: the full payloads are trusted because the
// worker is ours.
const WorkerResponseTag = Schema.Struct({
	type: Schema.Literals([
		"meta",
		"page",
		"done",
		"extracted",
		"zipped",
		"merged",
		"metadata",
		"stripped",
		"zip-chunk",
		"compress-progress",
		"compressed",
		"error",
	]),
});

const isPdfWorkerResponse = (data: unknown): data is PdfWorkerResponse =>
	Schema.is(WorkerResponseTag)(data);

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
			Effect.callback<A, PdfLoadError>((resume) => {
				worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
					const res = event.data;

					// Ignore foreign/noise messages (dev-tooling, nested pdf.js worker)
					// that aren't our responses — failing on them would spuriously abort
					// an otherwise-healthy job. Genuine terminal messages still arrive and
					// resolve the Effect, so this cannot hang.
					if (!isPdfWorkerResponse(res)) return;
					JobResult.$match(handle(res), {
						Succeed: ({ value }) => resume(Effect.succeed(value)),
						Continue: () => {},
						// Unhandled by this op: map a reported error to its tagged type,
						// and fail on any other unexpected response rather than leaving
						// the Effect (and worker) hanging forever.
						Unhandled: () =>
							resume(
								res.type === "error"
									? Effect.fail(toTypedError(fileName, res))
									: Effect.fail(
											new PdfWorkerError({
												fileName,
												message: m.error_pdf_worker_unexpected({
													type: res.type,
												}),
											}),
										),
							),
					});
				};

				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new PdfWorkerError({
								fileName,
								message: event.message || m.error_pdf_worker_crashed(),
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
	readonly rotations?: ReadonlyArray<Rotation>;
}): Effect.Effect<ArrayBuffer, PdfLoadError> =>
	runWorkerJob<ArrayBuffer>(
		params.fileName,
		{
			type: "extract",
			id: params.id,
			buffer: params.buffer,
			pageIndices: [...params.pageIndices],
			rotations: params.rotations && [...params.rotations],
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

// Read the document info + XMP of one PDF.
export const readPdfMetadataInWorker = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
}): Effect.Effect<MetadataReport, PdfLoadError> =>
	runWorkerJob<MetadataReport>(
		params.fileName,
		{ type: "read-metadata", id: params.id, buffer: params.buffer },
		[params.buffer],
		(res) => (res.type === "metadata" ? Succeed(res.report) : Unhandled),
	);

// Strip the document info + XMP of one PDF. Resolves with the new bytes and
// what a re-read of them still finds.
export const stripPdfMetadataInWorker = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
}): Effect.Effect<
	{ readonly bytes: ArrayBuffer; readonly after: MetadataReport },
	PdfLoadError
> =>
	runWorkerJob(
		params.fileName,
		{ type: "strip-metadata", id: params.id, buffer: params.buffer },
		[params.buffer],
		(res) =>
			res.type === "stripped"
				? Succeed({ bytes: res.bytes, after: res.after })
				: Unhandled,
	);

// Render every page to PNG/JPEG and collect the streamed zip chunks into one
// Blob. `onProgress` fires with each chunk so the UI can show pages done.
export const rasterizePdfToZip = (
	params: {
		readonly id: string;
		readonly fileName: string;
		readonly buffer: ArrayBuffer;
		readonly maxPages: number;
		readonly format: RasterFormat;
		readonly dpi: RasterDpi;
		readonly baseName: string;
	},
	onProgress: (pagesDone: number, pageCount: number) => void,
): Effect.Effect<Blob, PdfLoadError> =>
	Effect.suspend(() => {
		const chunks: ArrayBuffer[] = [];

		return runWorkerJob<Blob>(
			params.fileName,
			{
				type: "rasterize",
				id: params.id,
				buffer: params.buffer,
				maxPages: params.maxPages,
				format: params.format,
				dpi: params.dpi,
				baseName: params.baseName,
			},
			[params.buffer],
			(res) => {
				switch (res.type) {
					case "zip-chunk":
						chunks.push(res.bytes);
						onProgress(res.pagesDone, res.pageCount);

						return Continue;
					case "done":
						return Succeed(new Blob(chunks, { type: "application/zip" }));
					default:
						return Unhandled;
				}
			},
		);
	});

// Run both compression passes in the worker. `onProgress` fires once per image
// of the image pass. Resolves with the new bytes and the image counts; whether
// they are worth keeping is the caller's call (see pdf-compress-result.ts).
export const compressPdfInWorker = (
	params: {
		readonly id: string;
		readonly fileName: string;
		readonly buffer: ArrayBuffer;
		readonly maxPages: number;
		readonly preset: CompressPresetId;
	},
	onProgress: (done: number, total: number) => void,
): Effect.Effect<
	{ readonly bytes: ArrayBuffer; readonly stats: CompressStats },
	PdfLoadError
> =>
	runWorkerJob(
		params.fileName,
		{
			type: "compress",
			id: params.id,
			buffer: params.buffer,
			maxPages: params.maxPages,
			preset: params.preset,
		},
		[params.buffer],
		(res) => {
			switch (res.type) {
				case "compress-progress":
					onProgress(res.done, res.total);

					return Continue;
				case "compressed":
					return Succeed({ bytes: res.bytes, stats: res.stats });
				default:
					return Unhandled;
			}
		},
	);

const toTypedError = (
	fileName: string,
	res: Extract<PdfWorkerResponse, { type: "error" }>,
): PdfLoadError => {
	switch (res.reason) {
		case "encrypted":
			return new EncryptedPdfError({
				fileName,
				message: m.error_pdf_encrypted(),
			});
		case "too-many-pages":
			return new PdfTooManyPagesError({
				fileName,
				pages: res.pageCount ?? 0,
				limit: MAX_PDF_PAGES,
				message: m.error_pdf_too_many({
					pages: res.pageCount ?? 0,
					limit: MAX_PDF_PAGES,
				}),
			});
		case "too-large":
			return new PdfRasterBudgetError({
				fileName,
				message:
					(res.dpi ?? 0) > 72
						? m.error_pdf_too_big_dpi({ dpi: res.dpi ?? 0 })
						: m.error_pdf_too_big(),
			});
		case "compress-images":
			return new PdfCompressError({
				fileName,
				stage: "images",
				message: m.error_pdf_compress_images(),
			});
		case "compress-codec":
			return new PdfCompressError({
				fileName,
				stage: "images",
				message: m.error_pdf_compress_codec(),
			});
		case "compress-lossless":
			return new PdfCompressError({
				fileName,
				stage: "lossless",
				message: m.error_pdf_compress_lossless(),
			});
		case "worker":
			return new PdfWorkerError({
				fileName,
				message: res.detail ?? m.error_pdf_worker_failed(),
			});
		default:
			return new InvalidPdfError({
				fileName,
				// pdf.js words its errors in English, so the page words this one.
				message: m.error_pdf_invalid(),
			});
	}
};

import { Effect } from "effect";

import {
	EncryptedPdfError,
	InvalidPdfError,
	PdfExtractError,
	type PdfLoadError,
	PdfTooManyPagesError,
	PdfWorkerError,
} from "./errors.ts";
import {
	MAX_PDF_PAGES,
	type PdfThumbnail,
	type PdfWorkerResponse,
	type RenderedPdf,
} from "./pdf-types.ts";

// Spin up a one-shot worker, transfer the PDF bytes in, and stream the rendered
// page thumbnails back. `onThumbnail` fires per page for progressive UI; the
// Effect resolves once with the full set. Termination is guaranteed via
// acquireUseRelease (success, failure, and interrupt all terminate the worker).
export const renderPdfThumbnails = (
	params: {
		readonly id: string;
		readonly fileName: string;
		readonly buffer: ArrayBuffer;
		readonly maxPages: number;
		readonly thumbnailWidth: number;
	},
	onThumbnail: (thumbnail: PdfThumbnail) => void,
): Effect.Effect<RenderedPdf, PdfLoadError> =>
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
			Effect.async<RenderedPdf, PdfLoadError>((resume) => {
				const thumbnails: PdfThumbnail[] = [];
				let pageCount = 0;

				worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
					const res = event.data;
					switch (res.type) {
						case "meta":
							pageCount = res.pageCount;
							break;
						case "page": {
							const thumbnail: PdfThumbnail = {
								index: res.index,
								bitmap: res.bitmap,
								width: res.width,
								height: res.height,
							};
							thumbnails.push(thumbnail);
							onThumbnail(thumbnail);
							break;
						}
						case "done":
							resume(Effect.succeed({ pageCount, thumbnails }));
							break;
						case "error":
							resume(Effect.fail(toTypedError(params.fileName, res)));
							break;
					}
				};
				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new PdfWorkerError({
								fileName: params.fileName,
								message: event.message || "PDF worker crashed.",
							}),
						),
					);
				};

				worker.postMessage(
					{
						type: "render",
						id: params.id,
						buffer: params.buffer,
						maxPages: params.maxPages,
						thumbnailWidth: params.thumbnailWidth,
					},
					[params.buffer],
				);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
	);

// Spin up a one-shot worker, transfer the PDF bytes in, and copy the requested
// pages into a new PDF. Resolves with the new document's bytes. Termination is
// guaranteed via acquireUseRelease.
export const extractPdfPages = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
	readonly pageIndices: ReadonlyArray<number>;
}): Effect.Effect<ArrayBuffer, PdfExtractError> =>
	Effect.acquireUseRelease(
		Effect.sync(
			() =>
				new Worker(new URL("../../workers/pdf.worker.ts", import.meta.url), {
					type: "module",
				}),
		),
		(worker) =>
			Effect.async<ArrayBuffer, PdfExtractError>((resume) => {
				worker.onmessage = (event: MessageEvent<PdfWorkerResponse>) => {
					const res = event.data;
					if (res.type === "extracted") {
						resume(Effect.succeed(res.bytes));
					} else if (res.type === "error") {
						resume(
							Effect.fail(
								new PdfExtractError({
									fileName: params.fileName,
									message: res.message,
								}),
							),
						);
					}
				};
				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new PdfExtractError({
								fileName: params.fileName,
								message: event.message || "PDF worker crashed.",
							}),
						),
					);
				};

				worker.postMessage(
					{
						type: "extract",
						id: params.id,
						buffer: params.buffer,
						pageIndices: [...params.pageIndices],
					},
					[params.buffer],
				);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
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

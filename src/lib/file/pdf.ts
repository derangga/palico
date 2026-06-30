import { Effect } from "effect";

import { InvalidPdfError, PdfTooLargeError } from "./errors.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type PdfThumbnail,
	THUMBNAIL_WIDTH,
} from "./pdf-types.ts";
import { renderPdfThumbnails } from "./pdf-worker-client.ts";

const MB = 1024 * 1024;

const validateSize = (file: File): Effect.Effect<void, PdfTooLargeError> =>
	file.size > MAX_PDF_BYTES
		? Effect.fail(
				new PdfTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_PDF_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(
						MAX_PDF_BYTES / MB,
					)} MB limit.`,
				}),
			)
		: Effect.void;

// Load a PDF and render every page to a thumbnail. The byte cap is checked on
// the main thread (cheap, pre-read); the page cap + encryption + parse failures
// are detected in the worker and surfaced as typed errors. `onThumbnail` fires
// per page so the UI can paint thumbnails as they arrive.
export const loadPdf = Effect.fn("Pdf.loadPdf")(function* (
	params: { readonly id: string; readonly file: File },
	onThumbnail: (thumbnail: PdfThumbnail) => void,
) {
	yield* validateSize(params.file);
	const buffer = yield* Effect.tryPromise({
		try: () => params.file.arrayBuffer(),
		catch: (err) =>
			new InvalidPdfError({
				fileName: params.file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});
	return yield* renderPdfThumbnails(
		{
			id: params.id,
			fileName: params.file.name,
			buffer,
			maxPages: MAX_PDF_PAGES,
			thumbnailWidth: THUMBNAIL_WIDTH,
		},
		onThumbnail,
	);
});

import { Effect } from "effect";

import {
	InvalidPdfError,
	PdfExtractError,
	PdfMergeError,
	PdfSplitError,
	PdfTooLargeError,
} from "./errors.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type PdfThumbnail,
	type RasterDpi,
	type RasterFormat,
	type Rotation,
	type SplitPart,
	THUMBNAIL_WIDTH,
} from "./pdf-types.ts";
import {
	extractPdfPages,
	mergePdfFiles,
	rasterizePdfToZip,
	renderPdfThumbnails,
	splitPdfToZip,
} from "./pdf-worker-client.ts";

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
	params: {
		readonly id: string;
		readonly file: File;
		// Cap how many pages are rasterized into thumbnails. The page-count guard
		// still uses the full document. Merge passes 1 (first-page cover only).
		readonly thumbnailLimit?: number;
	},
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
			thumbnailLimit: params.thumbnailLimit,
		},
		onThumbnail,
	);
});

// Copy the given 0-based page indices (in the given order) into a new PDF and
// return it as a downloadable Blob. The file is re-read here so the original
// File stays the source of truth (its buffer was transferred away during render).
export const extractPages = Effect.fn("Pdf.extractPages")(function* (params: {
	readonly id: string;
	readonly file: File;
	readonly pageIndices: ReadonlyArray<number>;
	// Organize PDF: degrees to add to each page, same order as pageIndices.
	readonly rotations?: ReadonlyArray<Rotation>;
}) {
	const buffer = yield* Effect.tryPromise({
		try: () => params.file.arrayBuffer(),
		catch: (err) =>
			new PdfExtractError({
				fileName: params.file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});
	const result = yield* extractPdfPages({
		id: params.id,
		fileName: params.file.name,
		buffer,
		pageIndices: params.pageIndices,
		rotations: params.rotations,
	});
	return new Blob([result], { type: "application/pdf" });
});

const baseName = (fileName: string) => fileName.replace(/\.pdf$/i, "");

// Plan: chunk the document into consecutive groups of up to `size` pages, each
// becoming one output PDF named "<base>_part_N.pdf".
export const everyNPageParts = (
	pageCount: number,
	size: number,
	fileName: string,
): ReadonlyArray<SplitPart> => {
	const base = baseName(fileName);
	const parts: SplitPart[] = [];
	for (let start = 0; start < pageCount; start += size) {
		const end = Math.min(start + size, pageCount);
		const pageIndices: number[] = [];
		for (let i = start; i < end; i++) pageIndices.push(i);
		parts.push({ name: `${base}_part_${parts.length + 1}.pdf`, pageIndices });
	}
	return parts;
};

// Plan: one single-page PDF per page, named "<base>_page_N.pdf".
export const allIndividualParts = (
	pageCount: number,
	fileName: string,
): ReadonlyArray<SplitPart> => {
	const base = baseName(fileName);
	const parts: SplitPart[] = [];
	for (let i = 0; i < pageCount; i++) {
		parts.push({ name: `${base}_page_${i + 1}.pdf`, pageIndices: [i] });
	}
	return parts;
};

// Split the PDF into the given parts and return them bundled as a single zip
// Blob. Same re-read rationale as extractPages.
export const splitPdf = Effect.fn("Pdf.splitPdf")(function* (params: {
	readonly id: string;
	readonly file: File;
	readonly parts: ReadonlyArray<SplitPart>;
}) {
	const buffer = yield* Effect.tryPromise({
		try: () => params.file.arrayBuffer(),
		catch: (err) =>
			new PdfSplitError({
				fileName: params.file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});
	const zip = yield* splitPdfToZip({
		id: params.id,
		fileName: params.file.name,
		buffer,
		parts: params.parts,
	});
	return new Blob([zip], { type: "application/zip" });
});

// Concatenate every page of every file (in the given order) into a single PDF
// and return it as a downloadable Blob. Each File is re-read here since its
// buffer was transferred away while rendering its cover thumbnail.
export const mergePdfs = Effect.fn("Pdf.mergePdfs")(function* (params: {
	readonly id: string;
	readonly files: ReadonlyArray<File>;
}) {
	const buffers = yield* Effect.forEach(params.files, (file) =>
		Effect.tryPromise({
			try: () => file.arrayBuffer(),
			catch: (err) =>
				new PdfMergeError({
					fileName: file.name,
					message: err instanceof Error ? err.message : "Could not read file.",
				}),
		}),
	);
	const merged = yield* mergePdfFiles({
		id: params.id,
		fileName: "merged.pdf",
		buffers,
	});
	return new Blob([merged], { type: "application/pdf" });
});

// Render every page to PNG or JPEG and return them zipped as one Blob. Same
// re-read rationale as extractPages. `onProgress` fires as pages finish.
export const pdfToImages = Effect.fn("Pdf.pdfToImages")(function* (
	params: {
		readonly id: string;
		readonly file: File;
		readonly format: RasterFormat;
		readonly dpi: RasterDpi;
	},
	onProgress: (pagesDone: number, pageCount: number) => void,
) {
	const buffer = yield* Effect.tryPromise({
		try: () => params.file.arrayBuffer(),
		catch: (err) =>
			new InvalidPdfError({
				fileName: params.file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});
	return yield* rasterizePdfToZip(
		{
			id: params.id,
			fileName: params.file.name,
			buffer,
			maxPages: MAX_PDF_PAGES,
			format: params.format,
			dpi: params.dpi,
			baseName: baseName(params.file.name),
		},
		onProgress,
	);
});

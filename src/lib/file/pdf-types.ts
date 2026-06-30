import { Schema } from "effect";

// Shared schemas + guards for the PDF tools (Merge / Split). Heavy work runs in
// src/workers/pdf.worker.ts; typed orchestration + errors live in
// src/lib/file/pdf.ts and pdf-worker-client.ts. Following src/lib/image/types.ts,
// the worker protocol is Schema-first: each shape is a Schema and its TS type is
// derived via Schema.Schema.Type, so there's one source of truth.

// Hard guards — keep thumbnail rendering safe on low-end mobile. Enforced as
// tagged errors (PdfTooLargeError / PdfTooManyPagesError) at load time.
export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PDF_PAGES = 100;

// Thumbnail render width in CSS px. Height derives from each page's aspect
// ratio. Small enough that 100 bitmaps stay comfortably within memory.
export const THUMBNAIL_WIDTH = 200;

// ImageBitmap is a browser/worker-only global (undefined during SSR), so unlike
// Schema.instanceOf we declare it lazily: the predicate only touches the global
// at call time, keeping module evaluation safe on the server.
const ImageBitmapFromSelf = Schema.declare(
	(input: unknown): input is ImageBitmap =>
		typeof ImageBitmap !== "undefined" && input instanceof ImageBitmap,
	{ identifier: "ImageBitmap" },
);

// --- Worker protocol (main thread <-> pdf.worker.ts) -----------------------

// Requests are tagged so later slices (merge, split) can add ops without
// disturbing the render path.
export const RenderRequest = Schema.Struct({
	type: Schema.Literal("render"),
	id: Schema.String,
	buffer: Schema.instanceOf(ArrayBuffer),
	maxPages: Schema.Number,
	thumbnailWidth: Schema.Number,
	// Cap how many pages are rasterized. The page-count guard still uses the
	// full document length; this only limits rendering. Merge sets this to 1 to
	// render just the first-page cover thumbnail. Omitted => render all pages.
	thumbnailLimit: Schema.optional(Schema.Number),
});
export type RenderRequest = Schema.Schema.Type<typeof RenderRequest>;

// Copy the given 0-based page indices (in the order provided) into a new PDF.
export const ExtractRequest = Schema.Struct({
	type: Schema.Literal("extract"),
	id: Schema.String,
	buffer: Schema.instanceOf(ArrayBuffer),
	pageIndices: Schema.Array(Schema.Number),
});
export type ExtractRequest = Schema.Schema.Type<typeof ExtractRequest>;

// One output PDF in a split job: a member file name + the 0-based page indices
// (in order) that make it up.
export const SplitPart = Schema.Struct({
	name: Schema.String,
	pageIndices: Schema.Array(Schema.Number),
});
export type SplitPart = Schema.Schema.Type<typeof SplitPart>;

// Copy each part into its own PDF, then bundle them all into a single zip.
export const SplitRequest = Schema.Struct({
	type: Schema.Literal("split"),
	id: Schema.String,
	buffer: Schema.instanceOf(ArrayBuffer),
	parts: Schema.Array(SplitPart),
});
export type SplitRequest = Schema.Schema.Type<typeof SplitRequest>;

// Concatenate every page of each buffer (in array order) into one PDF.
export const MergeRequest = Schema.Struct({
	type: Schema.Literal("merge"),
	id: Schema.String,
	buffers: Schema.Array(Schema.instanceOf(ArrayBuffer)),
});
export type MergeRequest = Schema.Schema.Type<typeof MergeRequest>;

export const PdfWorkerRequest = Schema.Union(
	RenderRequest,
	ExtractRequest,
	SplitRequest,
	MergeRequest,
);
export type PdfWorkerRequest = Schema.Schema.Type<typeof PdfWorkerRequest>;

export const PdfWorkerErrorReason = Schema.Literal(
	"invalid",
	"encrypted",
	"too-many-pages",
	"worker",
);
export type PdfWorkerErrorReason = Schema.Schema.Type<
	typeof PdfWorkerErrorReason
>;

// The worker streams its result: one "meta", then one "page" per rendered
// thumbnail, then "done". Any failure is reported as a single "error".
export const PdfWorkerResponse = Schema.Union(
	Schema.Struct({
		type: Schema.Literal("meta"),
		id: Schema.String,
		pageCount: Schema.Number,
	}),
	Schema.Struct({
		type: Schema.Literal("page"),
		id: Schema.String,
		index: Schema.Number, // 0-based page index
		bitmap: ImageBitmapFromSelf,
		width: Schema.Number,
		height: Schema.Number,
	}),
	Schema.Struct({
		type: Schema.Literal("done"),
		id: Schema.String,
	}),
	Schema.Struct({
		type: Schema.Literal("extracted"),
		id: Schema.String,
		bytes: Schema.instanceOf(ArrayBuffer),
	}),
	Schema.Struct({
		type: Schema.Literal("zipped"),
		id: Schema.String,
		bytes: Schema.instanceOf(ArrayBuffer),
	}),
	Schema.Struct({
		type: Schema.Literal("merged"),
		id: Schema.String,
		bytes: Schema.instanceOf(ArrayBuffer),
	}),
	Schema.Struct({
		type: Schema.Literal("error"),
		id: Schema.String,
		reason: PdfWorkerErrorReason,
		message: Schema.String,
		pageCount: Schema.optional(Schema.Number),
	}),
);
export type PdfWorkerResponse = Schema.Schema.Type<typeof PdfWorkerResponse>;

// --- Domain types (UI-facing) ----------------------------------------------

// A single rendered page thumbnail, ready to paint onto a <canvas>.
export const PdfThumbnail = Schema.Struct({
	index: Schema.Number, // 0-based page index
	bitmap: ImageBitmapFromSelf,
	width: Schema.Number,
	height: Schema.Number,
});
export type PdfThumbnail = Schema.Schema.Type<typeof PdfThumbnail>;

// The result of loading + rendering a PDF: its page count and the thumbnails.
export const RenderedPdf = Schema.Struct({
	pageCount: Schema.Number,
	thumbnails: Schema.Array(PdfThumbnail),
});
export type RenderedPdf = Schema.Schema.Type<typeof RenderedPdf>;

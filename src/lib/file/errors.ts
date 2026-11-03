import { Schema } from "effect";

// Distinct failure reasons for the file diff pipeline. Each carries enough
// context for the UI to show a specific, actionable message.

export class DiffParseError extends Schema.TaggedError<DiffParseError>()(
	"DiffParseError",
	{
		message: Schema.String,
	},
) {}

export class DiffInputTooLargeError extends Schema.TaggedError<DiffInputTooLargeError>()(
	"DiffInputTooLargeError",
	{
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

export type DiffError = DiffParseError | DiffInputTooLargeError;

// --- PDF tools (Merge / Split) ---------------------------------------------
// Distinct failure reasons for loading a PDF. Each carries enough context for
// the UI to show a specific, actionable message per file.

export class PdfTooLargeError extends Schema.TaggedError<PdfTooLargeError>()(
	"PdfTooLargeError",
	{
		fileName: Schema.String,
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

export class PdfTooManyPagesError extends Schema.TaggedError<PdfTooManyPagesError>()(
	"PdfTooManyPagesError",
	{
		fileName: Schema.String,
		pages: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

export class InvalidPdfError extends Schema.TaggedError<InvalidPdfError>()(
	"InvalidPdfError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export class EncryptedPdfError extends Schema.TaggedError<EncryptedPdfError>()(
	"EncryptedPdfError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export class PdfWorkerError extends Schema.TaggedError<PdfWorkerError>()(
	"PdfWorkerError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// PDF to Images: rendering every page at the chosen DPI would hold more than
// MAX_RASTER_TOTAL_PIXELS in memory. The message suggests a lower DPI.
export class PdfRasterBudgetError extends Schema.TaggedError<PdfRasterBudgetError>()(
	"PdfRasterBudgetError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export type PdfLoadError =
	| PdfTooLargeError
	| PdfTooManyPagesError
	| InvalidPdfError
	| EncryptedPdfError
	| PdfRasterBudgetError
	| PdfWorkerError;

// Raised when copying/saving pages into a new PDF fails (pdf-lib).
export class PdfExtractError extends Schema.TaggedError<PdfExtractError>()(
	"PdfExtractError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Raised when splitting into multiple PDFs or zipping them fails (pdf-lib/fflate).
export class PdfSplitError extends Schema.TaggedError<PdfSplitError>()(
	"PdfSplitError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Merging multiple PDFs into one failed (read or pdf-lib concat error).
export class PdfMergeError extends Schema.TaggedError<PdfMergeError>()(
	"PdfMergeError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// --- Office → PDF (LibreOffice WASM via ZetaOffice) -------------------------
// Distinct failure reasons for converting Office documents (.docx/.doc/.odt/
// .rtf) to PDF. Each carries enough context for the UI to show a specific,
// actionable message per file. The engine is loaded lazily on first use, so
// its download/init failures are modeled separately from conversion failures.

// A single input file is larger than the per-file byte cap. Checked on the
// main thread before the file is ever handed to the engine.
export class OfficeTooLargeError extends Schema.TaggedError<OfficeTooLargeError>()(
	"OfficeTooLargeError",
	{
		fileName: Schema.String,
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

// The batch as a whole exceeds the file-count and/or combined-size cap. Kept
// separate from OfficeTooLargeError so the UI can distinguish "this one file is
// too big" from "too many / too much at once".
export class OfficeBatchTooLargeError extends Schema.TaggedError<OfficeBatchTooLargeError>()(
	"OfficeBatchTooLargeError",
	{
		count: Schema.Number,
		totalSize: Schema.Number,
		fileLimit: Schema.Number,
		byteLimit: Schema.Number,
		message: Schema.String,
	},
) {}

// The file's extension isn't one LibreOffice will convert here. Carries the
// offending name so the toast can be specific.
export class OfficeUnsupportedFormatError extends Schema.TaggedError<OfficeUnsupportedFormatError>()(
	"OfficeUnsupportedFormatError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Surfaces from the engine loader (office-types.ts / office-engine.ts). `stage`
// mirrors the LoadPhase that was in flight when the failure landed, so the UI
// can keep the user oriented even after a mid-flight error.
export class OfficeEngineLoadError extends Schema.TaggedError<OfficeEngineLoadError>()(
	"OfficeEngineLoadError",
	{
		stage: Schema.Literals(["downloading", "caching", "preparing"]),
		message: Schema.String,
	},
) {}

// The engine hasn't finished loading (consent gate not completed / reload
// needed) when a conversion was requested.
export class OfficeEngineNotLoadedError extends Schema.TaggedError<OfficeEngineNotLoadedError>()(
	"OfficeEngineNotLoadedError",
	{
		message: Schema.String,
	},
) {}

// LibreOffice failed to load or store the document as PDF (bad/corrupt input,
// unsupported feature, OOM, or an aborted office thread).
export class OfficeConvertError extends Schema.TaggedError<OfficeConvertError>()(
	"OfficeConvertError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// Zipping the converted PDFs into a single archive failed (fflate).
export class OfficeZipError extends Schema.TaggedError<OfficeZipError>()(
	"OfficeZipError",
	{
		message: Schema.String,
	},
) {}

// Validation failures raised before any conversion begins.
export type OfficeValidationError =
	| OfficeTooLargeError
	| OfficeUnsupportedFormatError
	| OfficeBatchTooLargeError;

// Everything that can go wrong once conversion is under way.
export type OfficeConversionError =
	| OfficeEngineNotLoadedError
	| OfficeConvertError
	| OfficeZipError;

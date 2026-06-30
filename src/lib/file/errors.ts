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

export type PdfLoadError =
	| PdfTooLargeError
	| PdfTooManyPagesError
	| InvalidPdfError
	| EncryptedPdfError
	| PdfWorkerError;

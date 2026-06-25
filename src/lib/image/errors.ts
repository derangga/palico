import { Schema } from "effect";

// Distinct failure reasons for the image pipeline. Each carries enough context
// for the UI to show a specific, actionable message per file.

export class FileTooLargeError extends Schema.TaggedError<FileTooLargeError>()(
	"FileTooLargeError",
	{
		fileName: Schema.String,
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

export class DimensionsTooLargeError extends Schema.TaggedError<DimensionsTooLargeError>()(
	"DimensionsTooLargeError",
	{
		fileName: Schema.String,
		width: Schema.Number,
		height: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

export class DecodeError extends Schema.TaggedError<DecodeError>()(
	"DecodeError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export class EncodeError extends Schema.TaggedError<EncodeError>()(
	"EncodeError",
	{
		fileName: Schema.String,
		format: Schema.String,
		message: Schema.String,
	},
) {}

export class WorkerError extends Schema.TaggedError<WorkerError>()(
	"WorkerError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

export class ZipError extends Schema.TaggedError<ZipError>()("ZipError", {
	message: Schema.String,
}) {}

export type ConvertError =
	| FileTooLargeError
	| DimensionsTooLargeError
	| DecodeError
	| EncodeError
	| WorkerError;

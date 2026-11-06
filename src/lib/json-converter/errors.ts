import { Schema } from "effect";

// The text is not valid in the format it was read as. `line` and `column` are
// 1-based and point at the fault, so the page can say where to look.
export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
	format: Schema.Literals(["json", "yaml", "csv"]),
	line: Schema.Number,
	column: Schema.Number,
	message: Schema.String,
}) {}

// The data is valid but cannot become a table (a top-level object, items that
// are not objects, two fields that flatten to one column).
export class NotATableError extends Schema.TaggedError<NotATableError>()(
	"NotATableError",
	{
		message: Schema.String,
	},
) {}

export class InputTooLargeError extends Schema.TaggedError<InputTooLargeError>()(
	"InputTooLargeError",
	{
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

// The converter worker crashed or never started.
export class ConverterWorkerError extends Schema.TaggedError<ConverterWorkerError>()(
	"ConverterWorkerError",
	{
		message: Schema.String,
	},
) {}

export type ConvertError = ParseError | NotATableError | InputTooLargeError;

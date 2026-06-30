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

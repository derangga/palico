import { Schema } from "effect";

export class UnsupportedFormatError extends Schema.TaggedError<UnsupportedFormatError>()(
	"UnsupportedFormatError",
	{
		fileName: Schema.String,
		mime: Schema.String,
		message: Schema.String,
	},
) {}

// The container structure is broken (a segment runs past the end of the file,
// a bad signature). The file is not touched.
export class MetadataParseError extends Schema.TaggedError<MetadataParseError>()(
	"MetadataParseError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// The re-read after stripping still found removable data. The tool never
// reports a file as clean without this check passing.
export class MetadataStillPresentError extends Schema.TaggedError<MetadataStillPresentError>()(
	"MetadataStillPresentError",
	{
		fileName: Schema.String,
		fields: Schema.Array(Schema.String),
		message: Schema.String,
	},
) {}

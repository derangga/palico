import { Schema } from "effect";

// The id is not in memory. The page was reloaded (the map lives in memory
// only), the link was opened in a new tab, or the handoff was already taken.
// The page shows its normal dropzone with "Drop the file again".
export class HandoffMissingError extends Schema.TaggedError<HandoffMissingError>()(
	"HandoffMissingError",
	{
		id: Schema.String,
	},
) {}

// A zipped result (PDF split, PDF to images) could not be unpacked to send its
// files on. The download itself is unaffected.
export class HandoffUnzipError extends Schema.TaggedError<HandoffUnzipError>()(
	"HandoffUnzipError",
	{
		message: Schema.String,
	},
) {}

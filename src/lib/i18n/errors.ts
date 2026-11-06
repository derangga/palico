import { Schema } from "effect";

// localStorage can throw for reasons outside our control: disabled in private
// mode, blocked by the browser, or full. The language still works for this
// visit, so callers fall back to detection (read) or keep it in memory (write).
export class LocaleStorageError extends Schema.TaggedError<LocaleStorageError>()(
	"LocaleStorageError",
	{
		operation: Schema.Literals(["read", "write"]),
		message: Schema.String,
	},
) {}

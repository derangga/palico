import { Schema } from "effect";

// localStorage can throw for reasons outside our control: disabled in private
// mode, blocked by the browser, or full. The UI hides the "Your tools" row and
// disables starring; the tools themselves keep working.
export class ToolHistoryStorageError extends Schema.TaggedError<ToolHistoryStorageError>()(
	"ToolHistoryStorageError",
	{
		operation: Schema.Literals(["read", "write"]),
		message: Schema.String,
	},
) {}

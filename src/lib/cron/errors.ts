import { Schema } from "effect";

// The expression is not a valid five-field cron expression. `field` names the
// field at fault when there is one, so the page can mark that input.
export class CronSyntaxError extends Schema.TaggedError<CronSyntaxError>()(
	"CronSyntaxError",
	{
		message: Schema.String,
		field: Schema.optional(
			Schema.Literals(["minute", "hour", "dayOfMonth", "month", "dayOfWeek"]),
		),
	},
) {}

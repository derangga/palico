import type { CronFieldName } from "./schedule.ts";

// How each field is named on the page. `label` fits a narrow cell, `name`
// reads in a sentence and `hint` says what the field accepts.
export const FIELD_LABELS: Record<
	CronFieldName,
	{
		readonly label: string;
		readonly name: string;
		readonly hint: string;
	}
> = {
	minute: { label: "Minute", name: "Minute", hint: "0 to 59" },
	hour: { label: "Hour", name: "Hour", hint: "0 to 23" },
	dayOfMonth: { label: "Day", name: "Day of month", hint: "1 to 31" },
	month: { label: "Month", name: "Month", hint: "1 to 12 or JAN to DEC" },
	dayOfWeek: {
		label: "Weekday",
		name: "Day of week",
		hint: "0 to 6 or SUN to SAT",
	},
};

/** Which of the five fields the caret sits in, by counting the gaps before it. */
export function fieldAtCaret(text: string, caret: number): number {
	return Math.min(4, text.slice(0, caret).split(/\s+/).length - 1);
}

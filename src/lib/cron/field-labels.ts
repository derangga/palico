import { m } from "#/paraglide/messages.js";

import type { CronFieldName } from "./schedule.ts";

interface FieldLabel {
	readonly label: string;
	readonly name: string;
	readonly hint: string;
}

// How each field is named on the page. `label` fits a narrow cell, `name`
// reads in a sentence and `hint` says what the field accepts. A function,
// because the words depend on the active language.
export function fieldLabels(field: CronFieldName): FieldLabel {
	switch (field) {
		case "minute":
			return {
				label: m.cron_label_minute(),
				name: m.cron_label_minute(),
				hint: m.cron_hint_minute(),
			};
		case "hour":
			return {
				label: m.cron_label_hour(),
				name: m.cron_label_hour(),
				hint: m.cron_hint_hour(),
			};
		case "dayOfMonth":
			return {
				label: m.cron_label_day(),
				name: m.cron_name_day_of_month(),
				hint: m.cron_hint_day_of_month(),
			};
		case "month":
			return {
				label: m.cron_label_month(),
				name: m.cron_label_month(),
				hint: m.cron_hint_month(),
			};
		case "dayOfWeek":
			return {
				label: m.cron_label_weekday(),
				name: m.cron_name_day_of_week(),
				hint: m.cron_hint_day_of_week(),
			};
	}
}

/** Which of the five fields the caret sits in, by counting the gaps before it. */
export function fieldAtCaret(text: string, caret: number): number {
	// Leading spaces do not start a field, matching how the readout splits the text.
	return Math.min(4, text.slice(0, caret).trimStart().split(/\s+/).length - 1);
}

// The schedule builder reads a parsed cron schedule into a small form model
// (how often, plus the one or two details that apply) and writes it back out as
// an expression. Only the shapes the form can show are accepted. Anything else
// returns undefined and the page falls back to the text editor.

import { m } from "#/paraglide/messages.js";

import type { CronField, CronSchedule } from "./schedule.ts";

export type BuilderMode = "minutes" | "hourly" | "daily" | "weekly" | "monthly";

// A function, because the labels depend on the active language.
export const builderModes = (): ReadonlyArray<{
	readonly mode: BuilderMode;
	readonly label: string;
}> => [
	{ mode: "minutes", label: m.cron_mode_minutes() },
	{ mode: "hourly", label: m.cron_mode_hourly() },
	{ mode: "daily", label: m.cron_mode_daily() },
	{ mode: "weekly", label: m.cron_mode_weekly() },
	{ mode: "monthly", label: m.cron_mode_monthly() },
];

export interface BuilderState {
	readonly mode: BuilderMode;
	/** Minutes between runs, for `minutes`. */
	readonly every: number;
	/** Minute of the hour. For `hourly` it is the whole schedule, otherwise half of the time of day. */
	readonly minute: number;
	readonly hour: number;
	/** Weekdays for `weekly`, 0 for Sunday. */
	readonly days: ReadonlyArray<number>;
	/** Day of the month for `monthly`. */
	readonly dayOfMonth: number;
}

export const DEFAULT_BUILDER: BuilderState = {
	mode: "daily",
	every: 5,
	minute: 0,
	hour: 9,
	days: [1, 2, 3, 4, 5],
	dayOfMonth: 1,
};

/** Monday first, the order the day buttons are drawn in. */
export const WEEK_ORDER: ReadonlyArray<number> = [1, 2, 3, 4, 5, 6, 0];

const isPlain = (field: CronField, value: string) => field.source === value;

// A single number such as `9`. A list, range or step is not one.
const singleValue = (field: CronField): number | undefined => {
	const [only] = field.values;

	return /^\d+$/.test(field.source) && field.values.length === 1
		? only
		: undefined;
};

// Days written as values and ranges (`1,3`, `1-5`, `MON-FRI`). A step such as
// `*/2` would be rewritten as a list on the next edit, so it is not accepted.
const plainDays = (field: CronField): boolean =>
	!field.source.startsWith("*") &&
	!field.source.includes("/") &&
	field.values.length > 0;

/** The form model for a schedule, or undefined when the form cannot show it. */
export function builderFromSchedule(
	schedule: CronSchedule,
	base: BuilderState = DEFAULT_BUILDER,
): BuilderState | undefined {
	const { minute, hour, dayOfMonth, month, dayOfWeek } = schedule;

	if (!isPlain(month, "*")) return undefined;

	const everyDay = isPlain(dayOfMonth, "*") && isPlain(dayOfWeek, "*");
	const minuteValue = singleValue(minute);
	const hourValue = singleValue(hour);

	if (isPlain(hour, "*") && everyDay) {
		if (isPlain(minute, "*")) return { ...base, mode: "minutes", every: 1 };

		const step = /^\*\/(\d+)$/.exec(minute.source);

		if (step?.[1] !== undefined && Number(step[1]) >= 1) {
			return { ...base, mode: "minutes", every: Number(step[1]) };
		}

		if (minuteValue !== undefined) {
			return { ...base, mode: "hourly", minute: minuteValue };
		}

		return undefined;
	}

	if (minuteValue === undefined || hourValue === undefined) return undefined;

	const time = { minute: minuteValue, hour: hourValue };

	if (everyDay) return { ...base, ...time, mode: "daily" };

	if (isPlain(dayOfMonth, "*") && plainDays(dayOfWeek)) {
		return { ...base, ...time, mode: "weekly", days: dayOfWeek.values };
	}

	const dayValue = singleValue(dayOfMonth);

	if (dayValue !== undefined && isPlain(dayOfWeek, "*")) {
		return { ...base, ...time, mode: "monthly", dayOfMonth: dayValue };
	}

	return undefined;
}

// Runs of three or more days become a range (`1-5`), the rest stay a list.
function daysField(days: ReadonlyArray<number>): string {
	const sorted = [...new Set(days)].sort((a, b) => a - b);

	if (sorted.length === 7) return "*";

	const parts: Array<string> = [];
	let start = 0;

	while (start < sorted.length) {
		let end = start;

		while (sorted[end + 1] === (sorted[end] ?? 0) + 1) end += 1;

		if (end - start >= 2) {
			parts.push(`${sorted[start]}-${sorted[end]}`);
		} else {
			for (let at = start; at <= end; at += 1) parts.push(String(sorted[at]));
		}

		start = end + 1;
	}

	return parts.join(",");
}

/** The five-field expression for a form model. */
export function expressionFromBuilder(state: BuilderState): string {
	const { minute, hour } = state;

	switch (state.mode) {
		case "minutes":
			return state.every === 1 ? "* * * * *" : `*/${state.every} * * * *`;
		case "hourly":
			return `${minute} * * * *`;
		case "daily":
			return `${minute} ${hour} * * *`;
		case "weekly":
			return `${minute} ${hour} * * ${daysField(state.days)}`;
		case "monthly":
			return `${minute} ${hour} ${state.dayOfMonth} * *`;
	}
}

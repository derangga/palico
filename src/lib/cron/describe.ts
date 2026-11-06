// Turns a parsed schedule into a plain sentence in the active language. Every
// phrase is a whole message with parameters, because word order differs between
// English and Indonesian and joining fragments would read wrongly in one of them.
// The wording covers the common shapes (every N minutes, daily at a time,
// weekdays, first of the month) and falls back to a longer but exact list for
// odd ones.

import { currentLocale } from "#/lib/i18n/state.ts";
import { m } from "#/paraglide/messages.js";

import type { CronField, CronPart, CronSchedule } from "./schedule.ts";

// A Sunday, so day number n is n days after it.
const SUNDAY = Date.UTC(2024, 0, 7);
const DAY_MS = 24 * 60 * 60 * 1000;

// Month and weekday names come from the browser's own calendar data.
const calendarName = (
	date: number,
	options: Intl.DateTimeFormatOptions,
): string =>
	new Intl.DateTimeFormat(currentLocale(), {
		...options,
		timeZone: "UTC",
	}).format(date);

// Weekday 7 is Sunday, written as 0 everywhere else.
export const weekdayName = (n: number): string =>
	calendarName(SUNDAY + (n % 7) * DAY_MS, { weekday: "long" });

const monthName = (n: number): string =>
	calendarName(Date.UTC(2024, n - 1, 1), { month: "long" });

export const pad = (n: number) => String(n).padStart(2, "0");

/** "1st", "22nd" in English. Indonesian writes the plain number. */
export function ordinal(n: number): string {
	switch (
		new Intl.PluralRules(currentLocale(), { type: "ordinal" }).select(n)
	) {
		case "one":
			return m.cron_ordinal_one({ n });
		case "two":
			return m.cron_ordinal_two({ n });
		case "few":
			return m.cron_ordinal_few({ n });
		default:
			return m.cron_ordinal_other({ n });
	}
}

function joinList(items: ReadonlyArray<string>): string {
	if (items.length < 2) return items.join("");

	return m.cron_join({
		head: items.slice(0, -1).join(", "),
		last: items.at(-1) ?? "",
	});
}

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

function partText(part: CronPart, label: (n: number) => string): string {
	if (part.from === part.to && part.step === 1) return label(part.from);

	if (part.step === 1) {
		return m.cron_range({ from: label(part.from), to: label(part.to) });
	}

	return m.cron_range_step({
		step: part.step,
		from: label(part.from),
		to: label(part.to),
	});
}

const listText = (field: CronField, label: (n: number) => string) =>
	joinList(field.parts.map((part) => partText(part, label)));

// One stepped piece on its own, like */15 or 10-30/5.
function soleStep(field: CronField): CronPart | undefined {
	const [only] = field.parts;

	return field.parts.length === 1 && only && only.step > 1 ? only : undefined;
}

// Every piece is a single number, so the field is a plain list of values.
const isPlainList = (field: CronField) =>
	field.parts.every((part) => part.from === part.to && part.step === 1);

function minutePhrase(field: CronField): string {
	if (field.isAll) return m.cron_every_minute();

	const step = soleStep(field);

	if (step) {
		return step.wild
			? m.cron_every_n_minutes({ step: step.step })
			: m.cron_every_n_minutes_window({
					step: step.step,
					from: step.from,
					to: step.to,
				});
	}

	const list = listText(field, String);

	return field.values.length > 1
		? m.cron_at_minute_other({ list })
		: m.cron_at_minute_one({ list });
}

function hourPhrase(field: CronField): string {
	const step = soleStep(field);

	if (step) {
		return step.wild
			? m.cron_every_n_hours({ step: step.step })
			: m.cron_every_n_hours_window({
					step: step.step,
					from: `${pad(step.from)}:00`,
					to: `${pad(step.to)}:00`,
				});
	}

	const list = listText(field, String);

	return field.values.length > 1
		? m.cron_during_hour_other({ list })
		: m.cron_during_hour_one({ list });
}

// "0 9 * * *" is a clock time, so say "At 09:00" and not "at minute 0 during hour 9".
const CLOCK_LIMIT = 6;

function clockTimes(minute: CronField, hour: CronField): string | undefined {
	if (!isPlainList(minute) || !isPlainList(hour)) return undefined;

	if (minute.values.length * hour.values.length > CLOCK_LIMIT) return undefined;

	const times = hour.values.flatMap((h) =>
		minute.values.map((min) => `${pad(h)}:${pad(min)}`),
	);

	return m.cron_at_times({ times: joinList(times) });
}

interface TimeText {
	readonly text: string;
	readonly isClock: boolean;
}

function timeText(schedule: CronSchedule): TimeText {
	const { minute, hour } = schedule;

	if (minute.isAll && hour.isAll) {
		return { text: capitalize(m.cron_every_minute()), isClock: false };
	}

	const clock = clockTimes(minute, hour);

	if (clock) return { text: clock, isClock: true };

	if (hour.isAll) {
		const phrase = capitalize(minutePhrase(minute));
		const text =
			soleStep(minute) || minute.isAll
				? phrase
				: m.cron_past_every_hour({ phrase });

		return { text, isClock: false };
	}

	// One unbroken run of hours, like 9-17, reads best as a window.
	const [only] = hour.parts;

	if (
		hour.parts.length === 1 &&
		only &&
		only.step === 1 &&
		only.from !== only.to &&
		(minute.isAll || soleStep(minute))
	) {
		return {
			text: m.cron_between_hours({
				phrase: capitalize(minutePhrase(minute)),
				from: `${pad(only.from)}:00`,
				to: `${pad(only.to)}:59`,
			}),
			isClock: false,
		};
	}

	return {
		text: `${capitalize(minutePhrase(minute))}, ${hourPhrase(hour)}`,
		isClock: false,
	};
}

function dayOfMonthText(field: CronField): string {
	const step = soleStep(field);

	if (step?.wild) return m.cron_every_n_days({ step: step.step });

	return m.cron_on_day_of_month({ list: listText(field, ordinal) });
}

const dayOfWeekText = (field: CronField) =>
	m.cron_on_weekday({ list: listText(field, weekdayName) });

function monthText(field: CronField): string {
	const step = soleStep(field);

	if (step?.wild) return m.cron_every_n_months({ step: step.step });

	return m.cron_in_month({ list: listText(field, monthName) });
}

export function describeSchedule(schedule: CronSchedule): string {
	const { dayOfMonth, dayOfWeek, month } = schedule;
	const { text, isClock } = timeText(schedule);
	const clauses: Array<string> = [];

	if (!dayOfMonth.isAll && !dayOfWeek.isAll) {
		// Standard cron runs on either day when neither field starts with `*`.
		const both = dayOfMonth.startsWithStar || dayOfWeek.startsWithStar;
		const parts = {
			day: dayOfMonthText(dayOfMonth),
			weekday: dayOfWeekText(dayOfWeek),
		};

		clauses.push(
			both ? m.cron_day_and_weekday(parts) : m.cron_day_or_weekday(parts),
		);
	} else if (!dayOfMonth.isAll) {
		clauses.push(dayOfMonthText(dayOfMonth));
	} else if (!dayOfWeek.isAll) {
		clauses.push(dayOfWeekText(dayOfWeek));
	}

	if (!month.isAll) clauses.push(monthText(month));

	if (clauses.length === 0 && isClock) clauses.push(m.cron_every_day());

	return [text, ...clauses].join(", ");
}

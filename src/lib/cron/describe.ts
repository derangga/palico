// Turns a parsed schedule into a plain-English sentence. The wording covers the
// common shapes (every N minutes, daily at a time, weekdays, first of the month)
// and falls back to a longer but exact list for odd ones.

import type { CronField, CronPart, CronSchedule } from "./schedule.ts";

const MONTH_NAMES = [
	"",
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const WEEKDAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

// Weekday 7 is Sunday, written as 0 everywhere else.
const weekdayName = (n: number) => WEEKDAY_NAMES[n % 7] ?? String(n);

const pad = (n: number) => String(n).padStart(2, "0");

function ordinal(n: number): string {
	const rest = n % 100;

	if (rest >= 11 && rest <= 13) return `${n}th`;

	switch (n % 10) {
		case 1:
			return `${n}st`;
		case 2:
			return `${n}nd`;
		case 3:
			return `${n}rd`;
		default:
			return `${n}th`;
	}
}

function joinList(items: ReadonlyArray<string>): string {
	if (items.length < 2) return items.join("");

	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const capitalize = (text: string) =>
	text.charAt(0).toUpperCase() + text.slice(1);

function partText(part: CronPart, label: (n: number) => string): string {
	if (part.from === part.to && part.step === 1) return label(part.from);

	if (part.step === 1) return `${label(part.from)} through ${label(part.to)}`;

	return `every ${part.step} from ${label(part.from)} through ${label(part.to)}`;
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
	if (field.isAll) return "every minute";

	const step = soleStep(field);

	if (step) {
		const base = `every ${step.step} minutes`;

		return step.wild
			? base
			: `${base} from minute ${step.from} through ${step.to}`;
	}

	const noun = field.values.length > 1 ? "minutes" : "minute";

	return `at ${noun} ${listText(field, String)}`;
}

function hourPhrase(field: CronField): string {
	const step = soleStep(field);

	if (step) {
		return step.wild
			? `every ${step.step} hours`
			: `every ${step.step} hours from ${pad(step.from)}:00 through ${pad(step.to)}:00`;
	}

	const noun = field.values.length > 1 ? "hours" : "hour";

	return `during ${noun} ${listText(field, String)}`;
}

// "0 9 * * *" is a clock time, so say "At 09:00" and not "at minute 0 during hour 9".
const CLOCK_LIMIT = 6;

function clockTimes(minute: CronField, hour: CronField): string | undefined {
	if (!isPlainList(minute) || !isPlainList(hour)) return undefined;

	if (minute.values.length * hour.values.length > CLOCK_LIMIT) return undefined;

	const times = hour.values.flatMap((h) =>
		minute.values.map((m) => `${pad(h)}:${pad(m)}`),
	);

	return `At ${joinList(times)}`;
}

interface TimeText {
	readonly text: string;
	readonly isClock: boolean;
}

function timeText(schedule: CronSchedule): TimeText {
	const { minute, hour } = schedule;

	if (minute.isAll && hour.isAll)
		return { text: "Every minute", isClock: false };

	const clock = clockTimes(minute, hour);

	if (clock) return { text: clock, isClock: true };

	if (hour.isAll) {
		const text =
			soleStep(minute) || minute.isAll
				? capitalize(minutePhrase(minute))
				: `${capitalize(minutePhrase(minute))} past every hour`;

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
			text: `${capitalize(minutePhrase(minute))}, between ${pad(only.from)}:00 and ${pad(only.to)}:59`,
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

	if (step?.wild) return `every ${step.step} days`;

	return `on the ${listText(field, ordinal)} of the month`;
}

const dayOfWeekText = (field: CronField) =>
	`on ${listText(field, weekdayName)}`;

function monthText(field: CronField): string {
	const step = soleStep(field);

	if (step?.wild) return `every ${step.step} months`;

	return `in ${listText(field, (n) => MONTH_NAMES[n] ?? String(n))}`;
}

export function describeSchedule(schedule: CronSchedule): string {
	const { dayOfMonth, dayOfWeek, month } = schedule;
	const { text, isClock } = timeText(schedule);
	const clauses: Array<string> = [];

	if (!dayOfMonth.isAll && !dayOfWeek.isAll) {
		// Standard cron runs on either day when neither field starts with `*`.
		const joiner =
			dayOfMonth.startsWithStar || dayOfWeek.startsWithStar ? "and" : "or";

		clauses.push(
			`${dayOfMonthText(dayOfMonth)}, ${joiner} ${dayOfWeekText(dayOfWeek)}`,
		);
	} else if (!dayOfMonth.isAll) {
		clauses.push(dayOfMonthText(dayOfMonth));
	} else if (!dayOfWeek.isAll) {
		clauses.push(dayOfWeekText(dayOfWeek));
	}

	if (!month.isAll) clauses.push(monthText(month));

	if (clauses.length === 0 && isClock) clauses.push("every day");

	return [text, ...clauses].join(", ");
}

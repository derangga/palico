// Finds the next times a schedule fires. It jumps month, day and hour at a time
// instead of testing every minute, so a yearly schedule costs a few dozen steps.

import type { CronSchedule } from "./schedule.ts";

export type CronZone = "local" | "utc";

interface Fields {
	readonly year: number;
	readonly month: number;
	readonly day: number;
	readonly hour: number;
	readonly minute: number;
	readonly weekday: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
// Feb 29 on a century that skips its leap day is 8 years away. This clears it.
const HORIZON_YEARS = 9;
const MAX_STEPS = 50_000;

function fieldsOf(date: Date, zone: CronZone): Fields {
	return zone === "utc"
		? {
				year: date.getUTCFullYear(),
				month: date.getUTCMonth() + 1,
				day: date.getUTCDate(),
				hour: date.getUTCHours(),
				minute: date.getUTCMinutes(),
				weekday: date.getUTCDay(),
			}
		: {
				year: date.getFullYear(),
				month: date.getMonth() + 1,
				day: date.getDate(),
				hour: date.getHours(),
				minute: date.getMinutes(),
				weekday: date.getDay(),
			};
}

// Month is 1 to 12. Out-of-range days, hours and months roll over, which is how
// "the day after the 31st" becomes the 1st of the next month.
function build(
	zone: CronZone,
	year: number,
	month: number,
	day: number,
	hour: number,
	minute: number,
): Date {
	return zone === "utc"
		? new Date(Date.UTC(year, month - 1, day, hour, minute))
		: new Date(year, month - 1, day, hour, minute);
}

// A daylight saving change can make a rebuilt local time land on or before the
// current one. Fall back to a plain step so the search always moves forward.
function forward(current: Date, candidate: Date, fallbackMs: number): Date {
	return candidate.getTime() > current.getTime()
		? candidate
		: new Date(current.getTime() + fallbackMs);
}

function dayMatches(schedule: CronSchedule, fields: Fields): boolean {
	const dayOk = schedule.sets.dayOfMonth.has(fields.day);
	const weekdayOk = schedule.sets.dayOfWeek.has(fields.weekday);

	// Standard cron: when both day fields are restricted, either one may match.
	return schedule.dayOfMonth.startsWithStar || schedule.dayOfWeek.startsWithStar
		? dayOk && weekdayOk
		: dayOk || weekdayOk;
}

/** The first run strictly after `after`, or undefined if the schedule never fires (30 February). */
export function nextRun(
	schedule: CronSchedule,
	after: Date,
	zone: CronZone,
): Date | undefined {
	const lastYear = fieldsOf(after, zone).year + HORIZON_YEARS;
	let time = new Date(
		Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS,
	);

	for (let step = 0; step < MAX_STEPS; step++) {
		const f = fieldsOf(time, zone);

		if (f.year > lastYear) return undefined;

		if (!schedule.sets.month.has(f.month)) {
			time = forward(time, build(zone, f.year, f.month + 1, 1, 0, 0), HOUR_MS);
		} else if (!dayMatches(schedule, f)) {
			time = forward(
				time,
				build(zone, f.year, f.month, f.day + 1, 0, 0),
				HOUR_MS,
			);
		} else if (!schedule.sets.hour.has(f.hour)) {
			time = forward(
				time,
				build(zone, f.year, f.month, f.day, f.hour + 1, 0),
				HOUR_MS,
			);
		} else if (!schedule.sets.minute.has(f.minute)) {
			time = new Date(time.getTime() + MINUTE_MS);
		} else {
			return time;
		}
	}

	return undefined;
}

/** Up to `count` runs after `after`. Fewer come back when the schedule runs out. */
export function nextRuns(
	schedule: CronSchedule,
	after: Date,
	count: number,
	zone: CronZone,
): ReadonlyArray<Date> {
	const runs: Array<Date> = [];
	let cursor = after;

	while (runs.length < count) {
		const run = nextRun(schedule, cursor, zone);

		if (!run) break;

		runs.push(run);
		cursor = run;
	}

	return runs;
}

import type { CronZone } from "./next-runs.ts";

/** A run time as the person's locale writes it, in 24-hour time to match the description. */
export function formatRun(date: Date, zone: CronZone): string {
	return new Intl.DateTimeFormat(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZone: zone === "utc" ? "UTC" : undefined,
	}).format(date);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 5 minutes", "in 3 hours", "in 2 days". Rounds down, so it never promises a run sooner than it is. */
export function relativeTime(from: Date, to: Date): string {
	const gap = to.getTime() - from.getTime();

	if (gap < HOUR_MS)
		return relative.format(Math.floor(gap / MINUTE_MS), "minute");

	if (gap < 2 * DAY_MS)
		return relative.format(Math.floor(gap / HOUR_MS), "hour");

	return relative.format(Math.floor(gap / DAY_MS), "day");
}

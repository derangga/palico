import { currentLocale } from "#/lib/i18n/state.ts";
import { m } from "#/paraglide/messages.js";

import type { TimeClaim } from "./claims.ts";

export type Zone = "local" | "utc";

/** A moment with its seconds and zone name. A time claim has second precision. */
export function formatMoment(millis: number, zone: Zone): string {
	return new Intl.DateTimeFormat(currentLocale(), {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hourCycle: "h23",
		timeZoneName: "short",
		timeZone: zone === "utc" ? "UTC" : undefined,
	}).format(new Date(millis));
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// The largest gap each unit is used for. Past the last, the gap is in years.
const UNITS: ReadonlyArray<{
	readonly limit: number;
	readonly size: number;
	readonly unit: Intl.RelativeTimeFormatUnit;
}> = [
	{ limit: MINUTE_MS, size: SECOND_MS, unit: "second" },
	{ limit: HOUR_MS, size: MINUTE_MS, unit: "minute" },
	{ limit: 2 * DAY_MS, size: HOUR_MS, unit: "hour" },
	{ limit: 60 * DAY_MS, size: DAY_MS, unit: "day" },
	{ limit: 2 * 365 * DAY_MS, size: 30 * DAY_MS, unit: "month" },
];

/**
 * "in 12 minutes" or "3 hours ago". It truncates toward zero, so a token that
 * expires in 12 minutes and 50 seconds says 12 and never promises more time.
 */
export function describeGap(now: number, target: number): string {
	const gap = target - now;
	const size = Math.abs(gap);

	const step = UNITS.find(({ limit }) => size < limit) ?? {
		size: 365 * DAY_MS,
		unit: "year" as const,
	};

	return new Intl.RelativeTimeFormat(currentLocale(), {
		numeric: "auto",
	}).format(Math.trunc(gap / step.size), step.unit);
}

/** The sentence under a time claim: "Expired 3 hours ago", "Becomes valid in 2 days". */
export function noteFor(claim: TimeClaim, now: number, millis: number): string {
	const when = describeGap(now, millis);
	const past = millis <= now;

	switch (claim) {
		case "exp":
			return past
				? m.jwt_note_exp_past({ when })
				: m.jwt_note_exp_future({ when });
		case "nbf":
			return past
				? m.jwt_note_nbf_past({ when })
				: m.jwt_note_nbf_future({ when });
		case "iat":
			return m.jwt_note_iat({ when });
	}
}

import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { nextRun, nextRuns } from "./next-runs.ts";
import { parseCron } from "./schedule.ts";

const schedule = (expression: string) => Effect.runSync(parseCron(expression));

const iso = (dates: ReadonlyArray<Date | undefined>) =>
	dates.map((date) => date?.toISOString());

const at = (text: string) => new Date(text);

describe("nextRun", () => {
	it("is strictly after the start, even on an exact match", () => {
		expect(
			iso([nextRun(schedule("30 9 * * *"), at("2026-03-10T09:30:00Z"), "utc")]),
		).toEqual(["2026-03-11T09:30:00.000Z"]);
	});

	it("drops the seconds of the start", () => {
		expect(
			iso([nextRun(schedule("* * * * *"), at("2026-03-10T09:30:45Z"), "utc")]),
		).toEqual(["2026-03-10T09:31:00.000Z"]);
	});

	it("rolls over the hour, day, month and year", () => {
		expect(
			iso([nextRun(schedule("0 0 1 1 *"), at("2026-11-05T12:00:00Z"), "utc")]),
		).toEqual(["2027-01-01T00:00:00.000Z"]);
		expect(
			iso([
				nextRun(schedule("59 23 * * *"), at("2026-12-31T23:59:00Z"), "utc"),
			]),
		).toEqual(["2027-01-01T23:59:00.000Z"]);
	});

	it("finds Feb 29 across years", () => {
		expect(
			iso([nextRun(schedule("0 0 29 2 *"), at("2026-03-01T00:00:00Z"), "utc")]),
		).toEqual(["2028-02-29T00:00:00.000Z"]);
		// 2100 is not a leap year, so the gap after 2096 is eight years.
		expect(
			iso([nextRun(schedule("0 0 29 2 *"), at("2096-03-01T00:00:00Z"), "utc")]),
		).toEqual(["2104-02-29T00:00:00.000Z"]);
	});

	it("returns undefined for a date that never exists", () => {
		expect(
			nextRun(schedule("0 0 31 2 *"), at("2026-01-01T00:00:00Z"), "utc"),
		).toBeUndefined();
	});

	it("matches either day field when both are restricted", () => {
		// The 13th, or any Friday. 2026-11-05 is a Thursday.
		const runs = nextRuns(
			schedule("0 0 13 * 5"),
			at("2026-11-05T00:00:00Z"),
			3,
			"utc",
		);

		expect(iso(runs)).toEqual([
			"2026-11-06T00:00:00.000Z",
			"2026-11-13T00:00:00.000Z",
			"2026-11-20T00:00:00.000Z",
		]);
	});

	it("needs both day fields when one starts with *", () => {
		// Every other day of the month, and only on Fridays.
		const runs = nextRuns(
			schedule("0 0 */2 * 5"),
			at("2026-11-05T00:00:00Z"),
			2,
			"utc",
		);

		expect(iso(runs)).toEqual([
			"2026-11-13T00:00:00.000Z",
			"2026-11-27T00:00:00.000Z",
		]);
	});

	it("treats weekday 7 as Sunday", () => {
		// 2026-11-08 is a Sunday.
		expect(
			iso([nextRun(schedule("0 12 * * 7"), at("2026-11-05T00:00:00Z"), "utc")]),
		).toEqual(["2026-11-08T12:00:00.000Z"]);
	});

	it("reads the fields in the zone it is given", () => {
		// The test runner's own zone is unknown, so compare against Date's local getters.
		const run = nextRun(
			schedule("30 9 * * *"),
			at("2026-03-10T00:00:00Z"),
			"local",
		);

		expect(run?.getHours()).toBe(9);
		expect(run?.getMinutes()).toBe(30);
	});
});

describe("nextRuns", () => {
	it("lists runs in order", () => {
		expect(
			iso(
				nextRuns(
					schedule("*/20 * * * *"),
					at("2026-03-10T09:05:00Z"),
					4,
					"utc",
				),
			),
		).toEqual([
			"2026-03-10T09:20:00.000Z",
			"2026-03-10T09:40:00.000Z",
			"2026-03-10T10:00:00.000Z",
			"2026-03-10T10:20:00.000Z",
		]);
	});

	it("stops early when the schedule runs out", () => {
		expect(
			nextRuns(schedule("0 0 31 2 *"), at("2026-01-01T00:00:00Z"), 5, "utc"),
		).toEqual([]);
	});
});

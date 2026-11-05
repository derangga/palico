import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
	type BuilderState,
	builderFromSchedule,
	DEFAULT_BUILDER,
	expressionFromBuilder,
} from "./builder.ts";
import { parseCron } from "./schedule.ts";

const read = (expression: string) =>
	builderFromSchedule(Effect.runSync(parseCron(expression)));

describe("builderFromSchedule", () => {
	it("reads minute steps", () => {
		expect(read("* * * * *")).toMatchObject({ mode: "minutes", every: 1 });
		expect(read("*/5 * * * *")).toMatchObject({ mode: "minutes", every: 5 });
		expect(read("*/20 * * * *")).toMatchObject({ mode: "minutes", every: 20 });
	});

	it("reads an hourly minute", () => {
		expect(read("0 * * * *")).toMatchObject({ mode: "hourly", minute: 0 });
		expect(read("@hourly")).toMatchObject({ mode: "hourly", minute: 0 });
		expect(read("45 * * * *")).toMatchObject({ mode: "hourly", minute: 45 });
	});

	it("reads a time of day", () => {
		expect(read("30 8 * * *")).toMatchObject({
			mode: "daily",
			hour: 8,
			minute: 30,
		});
		expect(read("@daily")).toMatchObject({ mode: "daily", hour: 0, minute: 0 });
	});

	it("reads weekdays as numbers, ranges and names", () => {
		expect(read("0 9 * * 1-5")).toMatchObject({
			mode: "weekly",
			days: [1, 2, 3, 4, 5],
		});
		expect(read("0 9 * * MON,WED,FRI")).toMatchObject({
			mode: "weekly",
			days: [1, 3, 5],
		});
		expect(read("0 2 * * 7")).toMatchObject({ mode: "weekly", days: [0] });
	});

	it("reads a day of the month", () => {
		expect(read("0 0 1 * *")).toMatchObject({
			mode: "monthly",
			dayOfMonth: 1,
			hour: 0,
		});
		expect(read("15 14 31 * *")).toMatchObject({
			mode: "monthly",
			dayOfMonth: 31,
		});
	});

	it("keeps the other fields of the base state", () => {
		const base: BuilderState = { ...DEFAULT_BUILDER, days: [6], every: 15 };
		const schedule = Effect.runSync(parseCron("0 9 * * *"));

		expect(builderFromSchedule(schedule, base)).toMatchObject({
			mode: "daily",
			days: [6],
			every: 15,
		});
	});

	it("returns undefined for shapes the form cannot show", () => {
		for (const expression of [
			"0-30/5 9-17 * * *",
			"0,30 9 * * *",
			"0 9,17 * * *",
			"0 9 * * */2",
			"0 9 1 * 1",
			"0 9 1,15 * *",
			"0 0 1 6 *",
			"*/5 9 * * *",
			"* 9 * * *",
		]) {
			expect(read(expression), expression).toBeUndefined();
		}
	});
});

describe("expressionFromBuilder", () => {
	const make = (patch: Partial<BuilderState>): BuilderState => ({
		...DEFAULT_BUILDER,
		...patch,
	});

	it("writes each mode", () => {
		expect(expressionFromBuilder(make({ mode: "minutes", every: 1 }))).toBe(
			"* * * * *",
		);
		expect(expressionFromBuilder(make({ mode: "minutes", every: 10 }))).toBe(
			"*/10 * * * *",
		);
		expect(expressionFromBuilder(make({ mode: "hourly", minute: 15 }))).toBe(
			"15 * * * *",
		);
		expect(
			expressionFromBuilder(make({ mode: "daily", hour: 7, minute: 5 })),
		).toBe("5 7 * * *");
		expect(
			expressionFromBuilder(make({ mode: "monthly", dayOfMonth: 15 })),
		).toBe("0 9 15 * *");
	});

	it("writes weekdays as a range, a list or a star", () => {
		const weekly = (days: ReadonlyArray<number>) =>
			expressionFromBuilder(make({ mode: "weekly", days }));

		expect(weekly([1, 2, 3, 4, 5])).toBe("0 9 * * 1-5");
		expect(weekly([1, 3, 5])).toBe("0 9 * * 1,3,5");
		expect(weekly([0, 6])).toBe("0 9 * * 0,6");
		expect(weekly([0, 1, 2])).toBe("0 9 * * 0-2");
		expect(weekly([1, 2])).toBe("0 9 * * 1,2");
		expect(weekly([3, 1, 1, 2])).toBe("0 9 * * 1-3");
		expect(weekly([0, 1, 2, 3, 4, 5, 6])).toBe("0 9 * * *");
	});

	it("round-trips every shape the builder can read", () => {
		for (const expression of [
			"* * * * *",
			"*/5 * * * *",
			"0 * * * *",
			"30 * * * *",
			"0 0 * * *",
			"30 8 * * *",
			"0 9 * * 1-5",
			"0 9 * * 1,3,5",
			"0 2 * * 0",
			"0 0 1 * *",
			"15 14 31 * *",
		]) {
			const state = read(expression);

			expect(state && expressionFromBuilder(state), expression).toBe(
				expression,
			);
		}
	});
});

import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";

import type { CronSyntaxError } from "./errors.ts";
import { parseCron } from "./schedule.ts";

const parse = (expression: string) => Effect.runSync(parseCron(expression));

const failure = (expression: string): CronSyntaxError => {
	const exit = Effect.runSyncExit(parseCron(expression));
	const error = Exit.isFailure(exit)
		? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
		: undefined;

	if (!error) throw new Error(`"${expression}" should not parse`);

	return error;
};

describe("parseCron", () => {
	it("reads * as every value", () => {
		const schedule = parse("* * * * *");

		expect(schedule.minute.values).toHaveLength(60);
		expect(schedule.minute.isAll).toBe(true);
		expect(schedule.dayOfWeek.values).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});

	it("reads lists, ranges and steps", () => {
		expect(parse("1,15 * * * *").minute.values).toEqual([1, 15]);
		expect(parse("* 9-17 * * *").hour.values).toEqual([
			9, 10, 11, 12, 13, 14, 15, 16, 17,
		]);
		expect(parse("*/15 * * * *").minute.values).toEqual([0, 15, 30, 45]);
		expect(parse("0-30/10 * * * *").minute.values).toEqual([0, 10, 20, 30]);
		expect(parse("5/20 * * * *").minute.values).toEqual([5, 25, 45]);
	});

	it("reads month and weekday names in any case", () => {
		expect(parse("0 0 * JAN,mar *").month.values).toEqual([1, 3]);
		expect(parse("0 0 * * Mon-Fri").dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
	});

	it("folds weekday 7 into Sunday", () => {
		expect(parse("0 0 * * 7").dayOfWeek.values).toEqual([0]);
		expect(parse("0 0 * * 5-7").dayOfWeek.values).toEqual([0, 5, 6]);
		expect(parse("0 0 * * 0-7").dayOfWeek.isAll).toBe(true);
	});

	it("expands macros", () => {
		expect(parse("@daily").hour.values).toEqual([0]);
		expect(parse("@hourly").minute.values).toEqual([0]);
		expect(parse("@hourly").hour.isAll).toBe(true);
		expect(parse("@WEEKLY").dayOfWeek.values).toEqual([0]);
		expect(parse("@yearly").month.values).toEqual([1]);
	});

	it("ignores extra spaces", () => {
		expect(parse("  0   9  *  *  1 ").hour.values).toEqual([9]);
	});

	it("names the field at fault", () => {
		expect(failure("60 * * * *").field).toBe("minute");
		expect(failure("* 24 * * *").field).toBe("hour");
		expect(failure("* * 0 * *").field).toBe("dayOfMonth");
		expect(failure("* * * 13 *").field).toBe("month");
		expect(failure("* * * * 8").field).toBe("dayOfWeek");
		expect(failure("* * * foo *").field).toBe("month");
	});

	it("rejects backwards ranges, bad steps and empty list entries", () => {
		expect(failure("30-10 * * * *").field).toBe("minute");
		expect(failure("*/0 * * * *").field).toBe("minute");
		expect(failure("*/x * * * *").field).toBe("minute");
		expect(failure("1,,2 * * * *").field).toBe("minute");
		expect(failure("1-2-3 * * * *").field).toBe("minute");
		expect(failure("*/5/2 * * * *").field).toBe("minute");
	});

	it("rejects the wrong number of fields", () => {
		expect(failure("").message).toMatch(/type a cron expression/i);
		expect(failure("* * * *").message).toMatch(/five fields.*has 4/);
		expect(failure("0 * * * * *").message).toMatch(/seconds/);
		expect(failure("0 * * * * * 2030").message).toMatch(/seconds and year/);
	});

	it("explains @reboot", () => {
		expect(failure("@reboot").message).toMatch(/startup/);
	});
});

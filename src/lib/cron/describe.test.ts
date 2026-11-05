import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { describeSchedule } from "./describe.ts";
import { parseCron } from "./schedule.ts";

const say = (expression: string) =>
	describeSchedule(Effect.runSync(parseCron(expression)));

describe("describeSchedule", () => {
	it("describes every minute and minute steps", () => {
		expect(say("* * * * *")).toBe("Every minute");
		expect(say("*/5 * * * *")).toBe("Every 5 minutes");
		expect(say("10-30/5 * * * *")).toBe(
			"Every 5 minutes from minute 10 through 30",
		);
	});

	it("describes hourly schedules", () => {
		expect(say("@hourly")).toBe("At minute 0 past every hour");
		expect(say("15 * * * *")).toBe("At minute 15 past every hour");
		expect(say("0,30 * * * *")).toBe("At minutes 0 and 30 past every hour");
	});

	it("describes clock times and says every day", () => {
		expect(say("0 9 * * *")).toBe("At 09:00, every day");
		expect(say("30 8,12,18 * * *")).toBe(
			"At 08:30, 12:30 and 18:30, every day",
		);
		expect(say("0,30 9 * * *")).toBe("At 09:00 and 09:30, every day");
	});

	it("describes weekdays and weekend days by name", () => {
		expect(say("0 9 * * 1-5")).toBe("At 09:00, on Monday through Friday");
		expect(say("0 10 * * 6,0")).toBe("At 10:00, on Saturday and Sunday");
		expect(say("0 10 * * 6,7")).toBe("At 10:00, on Saturday and Sunday");
	});

	it("describes the day of the month with ordinals", () => {
		expect(say("0 0 1 * *")).toBe("At 00:00, on the 1st of the month");
		expect(say("0 0 1,15 * *")).toBe(
			"At 00:00, on the 1st and 15th of the month",
		);
		expect(say("0 0 22 * *")).toBe("At 00:00, on the 22nd of the month");
		expect(say("0 0 11-13 * *")).toBe(
			"At 00:00, on the 11th through 13th of the month",
		);
	});

	it("describes months", () => {
		expect(say("@yearly")).toBe(
			"At 00:00, on the 1st of the month, in January",
		);
		expect(say("0 0 * 1-3 *")).toBe("At 00:00, in January through March");
		expect(say("0 0 1 */3 *")).toBe(
			"At 00:00, on the 1st of the month, every 3 months",
		);
	});

	it("describes a working-hours window", () => {
		expect(say("*/15 9-17 * * 1-5")).toBe(
			"Every 15 minutes, between 09:00 and 17:59, on Monday through Friday",
		);
		expect(say("* 9-17 * * *")).toBe("Every minute, between 09:00 and 17:59");
	});

	it("describes stepped hours", () => {
		expect(say("0 */2 * * *")).toBe("At minute 0, every 2 hours");
		expect(say("*/10 8,20 * * *")).toBe(
			"Every 10 minutes, during hours 8 and 20",
		);
	});

	it("says either day when both day fields are set", () => {
		expect(say("0 0 13 * 5")).toBe(
			"At 00:00, on the 13th of the month, or on Friday",
		);
		expect(say("0 0 */2 * 5")).toBe("At 00:00, every 2 days, and on Friday");
	});

	it("falls back to a list when there are too many clock times", () => {
		expect(say("0,10,20,30 8,9 * * *")).toBe(
			"At minutes 0, 10, 20 and 30, during hours 8 and 9",
		);
	});
});

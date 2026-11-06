import { Effect, SubscriptionRef } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localeRef, resetLocale } from "#/lib/i18n/state.ts";

import { describeSchedule, ordinal } from "./describe.ts";
import { parseCron } from "./schedule.ts";

const say = (expression: string) =>
	describeSchedule(Effect.runSync(parseCron(expression)));

describe("describeSchedule in Indonesian", () => {
	beforeEach(() => {
		Effect.runSync(SubscriptionRef.set(localeRef, "id"));
	});

	afterEach(() => {
		Effect.runSync(resetLocale);
	});

	it("words minute and hour steps", () => {
		expect(say("* * * * *")).toBe("Setiap menit");
		expect(say("*/5 * * * *")).toBe("Setiap 5 menit");
		expect(say("0,30 * * * *")).toBe("Pada menit 0 dan 30 setiap jam");
	});

	it("words clock times and every day", () => {
		expect(say("0 9 * * *")).toBe("Pukul 09:00, setiap hari");
		expect(say("30 8,12,18 * * *")).toBe(
			"Pukul 08:30, 12:30 dan 18:30, setiap hari",
		);
	});

	it("names weekdays and months from the calendar", () => {
		expect(say("0 9 * * 1-5")).toBe(
			"Pukul 09:00, pada hari Senin sampai Jumat",
		);
		expect(say("0 0 1 3 *")).toBe(
			"Pukul 00:00, pada tanggal 1, pada bulan Maret",
		);
	});

	it("writes a plain number where English adds a suffix", () => {
		expect(ordinal(1)).toBe("1");
		expect(ordinal(22)).toBe("22");
	});

	it("joins day of month and weekday with the right conjunction", () => {
		expect(say("0 0 1 * 1")).toBe(
			"Pukul 00:00, pada tanggal 1, atau pada hari Senin",
		);
	});
});

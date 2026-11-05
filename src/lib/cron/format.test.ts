import { describe, expect, it } from "vitest";

import { formatRun, relativeTime } from "./format.ts";

const at = (text: string) => new Date(text);

describe("relativeTime", () => {
	const now = at("2026-03-10T09:00:00Z");

	it("counts minutes under an hour", () => {
		expect(relativeTime(now, at("2026-03-10T09:05:00Z"))).toBe("in 5 minutes");
		expect(relativeTime(now, at("2026-03-10T09:01:00Z"))).toBe("in 1 minute");
	});

	it("counts hours up to two days", () => {
		expect(relativeTime(now, at("2026-03-10T12:30:00Z"))).toBe("in 3 hours");
		expect(relativeTime(now, at("2026-03-11T20:00:00Z"))).toBe("in 35 hours");
	});

	it("counts days after that", () => {
		expect(relativeTime(now, at("2026-03-14T09:00:00Z"))).toBe("in 4 days");
	});

	it("rounds down", () => {
		expect(relativeTime(now, at("2026-03-10T09:59:00Z"))).toBe("in 59 minutes");
	});
});

describe("formatRun", () => {
	it("writes a UTC run in 24-hour time", () => {
		const text = formatRun(at("2026-03-10T09:05:00Z"), "utc");

		expect(text).toContain("09:05");
		expect(text).toContain("2026");
	});
});

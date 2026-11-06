import { describe, expect, it } from "vitest";

import { describeGap, formatMoment, noteFor } from "./time.ts";

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("describeGap", () => {
	it("counts seconds under a minute", () => {
		expect(describeGap(NOW, NOW + 40 * SECOND)).toBe("in 40 seconds");
		expect(describeGap(NOW, NOW - 20 * SECOND)).toBe("20 seconds ago");
	});

	it("rounds down, so it never promises more time than there is", () => {
		expect(describeGap(NOW, NOW + 12 * MINUTE + 50 * SECOND)).toBe(
			"in 12 minutes",
		);
		expect(describeGap(NOW, NOW - (3 * HOUR + 50 * MINUTE))).toBe(
			"3 hours ago",
		);
	});

	it("moves to hours at an hour and to days past two days", () => {
		expect(describeGap(NOW, NOW + HOUR)).toBe("in 1 hour");
		expect(describeGap(NOW, NOW + 47 * HOUR)).toBe("in 47 hours");
		expect(describeGap(NOW, NOW + 2 * DAY)).toBe("in 2 days");
	});

	it("moves to months and years for far dates", () => {
		expect(describeGap(NOW, NOW + 90 * DAY)).toBe("in 3 months");
		expect(describeGap(NOW, NOW + 5 * 365 * DAY)).toBe("in 5 years");
	});
});

describe("noteFor", () => {
	it("says expires for a future exp and expired for a past one", () => {
		expect(noteFor("exp", NOW, NOW + 12 * MINUTE)).toBe(
			"Expires in 12 minutes",
		);
		expect(noteFor("exp", NOW, NOW - 3 * HOUR)).toBe("Expired 3 hours ago");
	});

	it("says becomes valid for a future nbf and valid since for a past one", () => {
		expect(noteFor("nbf", NOW, NOW + 2 * DAY)).toBe("Becomes valid in 2 days");
		expect(noteFor("nbf", NOW, NOW - 5 * MINUTE)).toBe(
			"Valid since 5 minutes ago",
		);
	});

	it("says issued for iat", () => {
		expect(noteFor("iat", NOW, NOW - 2 * DAY)).toBe("Issued 2 days ago");
	});
});

describe("formatMoment", () => {
	it("writes UTC with its seconds and zone name", () => {
		const text = formatMoment(Date.UTC(2026, 0, 2, 3, 4, 5), "utc");

		expect(text).toContain("2026");
		expect(text).toContain("03:04:05");
		expect(text).toContain("UTC");
	});
});

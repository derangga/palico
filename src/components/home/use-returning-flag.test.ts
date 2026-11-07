import { describe, expect, it } from "vitest";

import { returningFlagAction } from "./use-returning-flag.ts";

const input = (
	over: Partial<Parameters<typeof returningFlagAction>[0]> = {},
): Parameters<typeof returningFlagAction>[0] => ({
	decided: false,
	phase: "ready",
	returning: false,
	attributeSet: false,
	...over,
});

describe("returningFlagAction", () => {
	it("waits while the history is still being read", () => {
		expect(returningFlagAction(input({ phase: "idle", returning: true }))).toBe(
			"keep",
		);
	});

	it("sets the attribute for a returning visitor on the first decision", () => {
		expect(returningFlagAction(input({ returning: true }))).toBe("set");
	});

	it("removes the attribute for a first-time visitor on the first decision", () => {
		expect(returningFlagAction(input({ attributeSet: true }))).toBe("remove");
	});

	it("treats blocked storage as a first-time visitor", () => {
		expect(returningFlagAction(input({ phase: "unavailable" }))).toBe("remove");
	});

	it("does not hide Start here when a first star arrives mid-visit", () => {
		expect(returningFlagAction(input({ decided: true, returning: true }))).toBe(
			"keep",
		);
	});

	it("keeps the attribute while the row still has a tool", () => {
		expect(
			returningFlagAction(
				input({ decided: true, returning: true, attributeSet: true }),
			),
		).toBe("keep");
	});

	it("removes the attribute when the row empties after the decision", () => {
		expect(
			returningFlagAction(input({ decided: true, attributeSet: true })),
		).toBe("remove");
	});

	it("does nothing once the attribute is gone", () => {
		expect(returningFlagAction(input({ decided: true }))).toBe("keep");
	});
});

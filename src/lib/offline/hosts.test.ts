import { describe, expect, it } from "vitest";

import { controlledAtRegistration } from "./hosts.ts";

describe("controlledAtRegistration", () => {
	it("counts a controller only when the registration already had an active worker", () => {
		expect(controlledAtRegistration({}, {})).toBe(true);
	});

	it("ignores a stale controller left over from before Stop", () => {
		// A fresh registration has no active worker yet, but the page still has the
		// old worker as its controller until it reloads.
		expect(controlledAtRegistration(null, {})).toBe(false);
	});

	it("is false for a page no worker controls", () => {
		expect(controlledAtRegistration({}, null)).toBe(false);
		expect(controlledAtRegistration(null, null)).toBe(false);
	});
});

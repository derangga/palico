import { describe, expect, it } from "vitest";

import { shouldSwap } from "./pill-swap.ts";

describe("shouldSwap", () => {
	it("does not animate a page load for a first-time visitor", () => {
		// Unavailable (state unknown), Preparing, then Off.
		expect(shouldSwap("Unavailable", "Preparing", false)).toBe(false);
		expect(shouldSwap("Preparing", "Off", false)).toBe(false);
	});

	it("does not animate a page load for someone who turned offline on", () => {
		expect(shouldSwap("Unavailable", "Preparing", false)).toBe(false);
		expect(shouldSwap("Preparing", "Ready", false)).toBe(false);
		expect(shouldSwap("Preparing", "NeedsDownload", false)).toBe(false);
	});

	it("animates Off to Preparing to Ready", () => {
		expect(shouldSwap("Off", "Preparing", true)).toBe(true);
		expect(shouldSwap("Preparing", "Ready", true)).toBe(true);
	});

	it("animates Stop (Ready to Off) even when Off was never shown", () => {
		expect(shouldSwap("Ready", "Off", false)).toBe(true);
	});

	it("animates a failed registration and the retry once Off was shown", () => {
		expect(shouldSwap("Preparing", "Unavailable", true)).toBe(true);
		expect(shouldSwap("Unavailable", "Preparing", true)).toBe(true);
	});

	it("ignores a state that did not change", () => {
		expect(shouldSwap("Off", "Off", true)).toBe(false);
	});
});

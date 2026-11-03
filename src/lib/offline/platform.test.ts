import { describe, expect, it } from "vitest";

import { needsHomeScreenHint } from "./platform.ts";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const MAC =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const ANDROID =
	"Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36";

describe("needsHomeScreenHint", () => {
	it("hints on iPhone in a browser tab", () => {
		expect(
			needsHomeScreenHint({
				userAgent: IPHONE,
				maxTouchPoints: 5,
				standalone: false,
			}),
		).toBe(true);
	});
	it("hints on iPadOS, which reports as a Mac with touch", () => {
		expect(
			needsHomeScreenHint({
				userAgent: MAC,
				maxTouchPoints: 5,
				standalone: false,
			}),
		).toBe(true);
	});
	it("does not hint on a real Mac", () => {
		expect(
			needsHomeScreenHint({
				userAgent: MAC,
				maxTouchPoints: 0,
				standalone: false,
			}),
		).toBe(false);
	});
	it("does not hint once installed", () => {
		expect(
			needsHomeScreenHint({
				userAgent: IPHONE,
				maxTouchPoints: 5,
				standalone: true,
			}),
		).toBe(false);
	});
	it("does not hint on Android", () => {
		expect(
			needsHomeScreenHint({
				userAgent: ANDROID,
				maxTouchPoints: 5,
				standalone: false,
			}),
		).toBe(false);
	});
});

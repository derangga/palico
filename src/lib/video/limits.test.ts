import { describe, expect, it } from "vitest";

import {
	checkFileSize,
	classifyDevice,
	estimateMinutes,
	MB,
	processTimeWarningLevel,
} from "./limits.ts";

const DESKTOP_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

describe("classifyDevice", () => {
	it("classifies a desktop UA on a wide viewport as desktop", () => {
		expect(classifyDevice({ userAgent: DESKTOP_UA, viewportWidth: 1440 })).toBe(
			"desktop",
		);
	});

	it("classifies a mobile UA as mobile even on a wide viewport", () => {
		expect(classifyDevice({ userAgent: IPHONE_UA, viewportWidth: 1440 })).toBe(
			"mobile",
		);
		expect(classifyDevice({ userAgent: ANDROID_UA, viewportWidth: 1440 })).toBe(
			"mobile",
		);
	});

	it("classifies a desktop UA on a narrow viewport as mobile (heuristic)", () => {
		expect(classifyDevice({ userAgent: DESKTOP_UA, viewportWidth: 600 })).toBe(
			"mobile",
		);
	});

	it("treats the 768px boundary as desktop, just-under as mobile", () => {
		expect(classifyDevice({ userAgent: DESKTOP_UA, viewportWidth: 768 })).toBe(
			"desktop",
		);
		expect(classifyDevice({ userAgent: DESKTOP_UA, viewportWidth: 767 })).toBe(
			"mobile",
		);
	});
});

describe("checkFileSize", () => {
	it("accepts files under the desktop warn threshold", () => {
		expect(checkFileSize(199 * MB, "desktop")).toEqual({ kind: "ok" });
		expect(checkFileSize(200 * MB, "desktop")).toEqual({ kind: "ok" });
	});

	it("warns between desktop warn and hard cap", () => {
		expect(checkFileSize(201 * MB, "desktop")).toEqual({
			kind: "warn",
			warnMB: 200,
		});
		expect(checkFileSize(500 * MB, "desktop")).toEqual({
			kind: "warn",
			warnMB: 200,
		});
	});

	it("rejects files over the desktop hard cap", () => {
		expect(checkFileSize(501 * MB, "desktop")).toEqual({
			kind: "rejected",
			capMB: 500,
		});
	});

	it("applies the lower mobile caps", () => {
		expect(checkFileSize(100 * MB, "mobile")).toEqual({ kind: "ok" });
		expect(checkFileSize(101 * MB, "mobile")).toEqual({
			kind: "warn",
			warnMB: 100,
		});
		expect(checkFileSize(201 * MB, "mobile")).toEqual({
			kind: "rejected",
			capMB: 200,
		});
	});
});

describe("estimateMinutes", () => {
	it("floors at 1 minute for tiny files", () => {
		expect(estimateMinutes(1 * MB, "mp4")).toBe(1);
	});

	it("estimates webm (VP9) slower than mp4 (H.264) for the same size", () => {
		const bytes = 200 * MB;
		expect(estimateMinutes(bytes, "webm")).toBeGreaterThan(
			estimateMinutes(bytes, "mp4"),
		);
	});

	it("estimates avi (MPEG-4) faster than mp4 for the same size", () => {
		const bytes = 200 * MB;
		expect(estimateMinutes(bytes, "avi")).toBeLessThan(
			estimateMinutes(bytes, "mp4"),
		);
	});
});

describe("processTimeWarningLevel", () => {
	it("is none below 20MB", () => {
		expect(processTimeWarningLevel(19 * MB)).toBe("none");
	});

	it("is suppressible in the 20–50MB band", () => {
		expect(processTimeWarningLevel(20 * MB)).toBe("suppressible");
		expect(processTimeWarningLevel(49 * MB)).toBe("suppressible");
	});

	it("is always at or above 50MB", () => {
		expect(processTimeWarningLevel(50 * MB)).toBe("always");
		expect(processTimeWarningLevel(600 * MB)).toBe("always");
	});
});

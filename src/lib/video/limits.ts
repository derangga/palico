// Input guardrails for the video converter: size caps, device classification,
// and the process-time warning thresholds + estimate.
//
// Pure module — no @ffmpeg/* imports, no side effects (does not read globals),
// fully unit-testable. Mirrors the style of types.ts: plain total functions +
// Schema types. Device/global reads happen in the route layer, which passes
// explicit inputs in here.

import { Schema } from "effect";

import type { VideoOutputFormat } from "./types.ts";

export const MB = 1024 * 1024;

// Max videos queued per batch. Lower than the image tools' 10 because video is
// far heavier: conversion is strictly sequential (one ffmpeg.wasm worker) and
// every finished output blob is retained until download, so a big queue means a
// very long wait and growing memory. 5 bounds the worst case (5 × 500MB cap).
export const MAX_FILES = 5;

// 768px — the same breakpoint src/hooks/use-mobile.ts uses to call a viewport
// "mobile". Kept local so this module stays free of React/DOM imports.
const MOBILE_VIEWPORT_MAX = 768;

export const DeviceClass = Schema.Literal("mobile", "desktop");
export type DeviceClass = Schema.Schema.Type<typeof DeviceClass>;

// iOS Safari + Android Chrome are tighter on memory, so they get lower caps.
// Warn = still accepted, soft heads-up. Hard = rejected outright.
export const CAPS: Record<
	DeviceClass,
	{ readonly warnBytes: number; readonly hardBytes: number }
> = {
	desktop: { warnBytes: 200 * MB, hardBytes: 500 * MB },
	mobile: { warnBytes: 100 * MB, hardBytes: 200 * MB },
};

// Process-time dialog thresholds (tiered):
//   < SHOW       → no dialog (these convert quickly)
//   SHOW..FLOOR  → dialog shown, but suppressible via "don't show again"
//   >= FLOOR     → dialog always shown, regardless of preference
export const PROCESS_TIME_SHOW_BYTES = 20 * MB;
export const PROCESS_TIME_FLOOR_BYTES = 50 * MB;

// UA patterns that indicate a phone/tablet. Paired with a viewport check so we
// don't rely on UA alone (and so a narrow desktop window is treated cautiously).
const MOBILE_UA =
	/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

// Pure classification. Returns "mobile" if EITHER the UA looks mobile OR the
// viewport is narrow — the conservative choice, since mobile gets the safer
// (lower) memory caps and ambiguous cases should not over-commit memory.
export const classifyDevice = (input: {
	readonly userAgent: string;
	readonly viewportWidth: number;
}): DeviceClass =>
	MOBILE_UA.test(input.userAgent) || input.viewportWidth < MOBILE_VIEWPORT_MAX
		? "mobile"
		: "desktop";

// Verdict carries numbers only — the route composes the user-facing copy so the
// warm/brand strings live next to the other toast copy (mirrors converter.tsx).
export const SizeVerdict = Schema.Union(
	Schema.Struct({ kind: Schema.Literal("ok") }),
	Schema.Struct({ kind: Schema.Literal("warn"), warnMB: Schema.Number }),
	Schema.Struct({ kind: Schema.Literal("rejected"), capMB: Schema.Number }),
);
export type SizeVerdict = Schema.Schema.Type<typeof SizeVerdict>;

export const checkFileSize = (
	bytes: number,
	device: DeviceClass,
): SizeVerdict => {
	const { warnBytes, hardBytes } = CAPS[device];
	if (bytes > hardBytes) {
		return { kind: "rejected", capMB: Math.round(hardBytes / MB) };
	}
	if (bytes > warnBytes) {
		return { kind: "warn", warnMB: Math.round(warnBytes / MB) };
	}
	return { kind: "ok" };
};

// Rough v1 throughput per output codec (MB of source processed per minute on
// typical mid-range hardware). libx264 (mp4/mov/mkv) is the baseline; VP9
// (webm) is much slower; MPEG-4 (avi) is faster. Calibrate later — ballpark
// is fine for setting expectations.
export const CODEC_THROUGHPUT_MB_PER_MIN: Record<VideoOutputFormat, number> = {
	mp4: 25,
	mov: 25,
	mkv: 25,
	webm: 8,
	avi: 50,
};

// Whole-minute estimate with a floor of 1 — we never promise "0 minutes".
export const estimateMinutes = (
	bytes: number,
	format: VideoOutputFormat,
): number => {
	const sizeMB = bytes / MB;
	const throughput = CODEC_THROUGHPUT_MB_PER_MIN[format];
	return Math.max(1, Math.ceil(sizeMB / throughput));
};

export type ProcessTimeWarningLevel = "none" | "suppressible" | "always";

export const processTimeWarningLevel = (
	bytes: number,
): ProcessTimeWarningLevel => {
	if (bytes >= PROCESS_TIME_FLOOR_BYTES) return "always";
	if (bytes >= PROCESS_TIME_SHOW_BYTES) return "suppressible";
	return "none";
};

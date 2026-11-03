// Compress Video settings: the choices, defaults and the bitrate math.
//
// Pure module, no @ffmpeg/* imports, so the /video-compressor route can import
// it statically. The pipeline that uses these lives in compress.ts (dynamic
// import only).

import { Schema } from "effect";

export const CompressQuality = Schema.Literal("high", "medium", "low");
export type CompressQuality = Schema.Schema.Type<typeof CompressQuality>;

export const CRF_BY_QUALITY: Record<CompressQuality, number> = {
	high: 23,
	medium: 28,
	low: 32,
};

export const QUALITY_OPTIONS: ReadonlyArray<{
	readonly value: CompressQuality;
	readonly label: string;
}> = [
	{ value: "high", label: "High" },
	{ value: "medium", label: "Medium" },
	{ value: "low", label: "Low" },
];
export const DEFAULT_QUALITY: CompressQuality = "medium";

// The SHORT side in pixels, so portrait video keeps its orientation.
export const Resolution = Schema.Literal("original", "1080", "720", "480");
export type Resolution = Schema.Schema.Type<typeof Resolution>;

export const RESOLUTION_OPTIONS: ReadonlyArray<{
	readonly value: Resolution;
	readonly label: string;
}> = [
	{ value: "original", label: "Original" },
	{ value: "1080", label: "1080p" },
	{ value: "720", label: "720p" },
	{ value: "480", label: "480p" },
];
export const DEFAULT_RESOLUTION: Resolution = "original";

export const CompressMode = Schema.Union(
	Schema.TaggedStruct("size", { targetMB: Schema.Number }),
	Schema.TaggedStruct("quality", { quality: CompressQuality }),
);
export type CompressMode = Schema.Schema.Type<typeof CompressMode>;

export const SizeChoice = Schema.Literal("10", "25", "50", "custom");
export type SizeChoice = Schema.Schema.Type<typeof SizeChoice>;

export const SIZE_PRESETS: ReadonlyArray<{
	readonly value: Exclude<SizeChoice, "custom">;
	readonly mb: number;
	readonly label: string;
}> = [
	{ value: "10", mb: 10, label: "10 MB (Discord)" },
	{ value: "25", mb: 25, label: "25 MB (Email)" },
	{ value: "50", mb: 50, label: "50 MB" },
];
export const DEFAULT_SIZE_CHOICE: SizeChoice = "25";

// Decimal MB: the stricter reading of "10 MB" on upload sites.
export const targetBytes = (mb: number): number => mb * 1_000_000;

// A preset or custom size the file is already under can't shrink anything.
export const isUnderTarget = (fileBytes: number, mb: number): boolean =>
	fileBytes <= targetBytes(mb);

// A file at or under the smallest preset has no size to aim for, so the panel
// starts on Quality.
export const startsOnQuality = (fileBytes: number): boolean =>
	isUnderTarget(fileBytes, SIZE_PRESETS[0].mb);

export const AUDIO_KBPS_SIZE = 96;
export const AUDIO_KBPS_QUALITY = 128;
// Below this the picture is not worth keeping; ask for a bigger target.
export const MIN_VIDEO_KBPS = 150;
// 5% of the target is left for the MP4 container.
const CONTAINER_MARGIN = 0.95;
// -bufsize is 2 s of video, so a capped encode can overshoot by that much.
const BUFFER_SECONDS = 2;

export type BitratePlan =
	| { readonly kind: "ok"; readonly videoKbps: number }
	| { readonly kind: "too-small"; readonly minMB: number };

// Video bitrate that keeps the file under `targetMB`. With
// `-maxrate B -bufsize 2B` the video stays at or under B × (duration + 2 s).
export const planVideoKbps = (
	targetMB: number,
	durationSec: number,
): BitratePlan => {
	const budgetBits = targetBytes(targetMB) * 8 * CONTAINER_MARGIN;
	const audioBits = AUDIO_KBPS_SIZE * 1000 * durationSec;
	const videoKbps = Math.floor(
		(budgetBits - audioBits) / (durationSec + BUFFER_SECONDS) / 1000,
	);
	if (videoKbps >= MIN_VIDEO_KBPS) return { kind: "ok", videoKbps };
	const neededBits =
		MIN_VIDEO_KBPS * 1000 * (durationSec + BUFFER_SECONDS) + audioBits;
	return {
		kind: "too-small",
		minMB: Math.ceil(neededBits / (8 * CONTAINER_MARGIN) / 1_000_000),
	};
};

export type CustomSizeVerdict =
	| { readonly kind: "ok"; readonly mb: number }
	| { readonly kind: "invalid"; readonly message: string };

// Validates the custom MB field as the user types.
export const checkCustomSize = (
	text: string,
	fileBytes: number,
): CustomSizeVerdict => {
	const mb = Number(text);
	if (text.trim() === "" || !Number.isFinite(mb) || mb <= 0) {
		return { kind: "invalid", message: "Enter a size in MB." };
	}
	if (isUnderTarget(fileBytes, mb)) {
		return {
			kind: "invalid",
			message: "This video is already under that size.",
		};
	}
	return { kind: "ok", mb };
};

// clip.mov → clip-compressed.mp4, so the saved file never shadows the source.
export const compressedFileName = (srcName: string): string => {
	const dot = srcName.lastIndexOf(".");
	const base = dot > 0 ? srcName.slice(0, dot) : srcName;
	return `${base}-compressed.mp4`;
};

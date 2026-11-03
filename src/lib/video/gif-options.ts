// Video to GIF settings: the choices, defaults and limits.
//
// Pure module, no @ffmpeg/* imports, so the /video-to-gif route can import it
// statically. The pipeline that uses these lives in gif.ts (dynamic import only).

import { Schema } from "effect";

export const GifFps = Schema.Literal(8, 12, 15);
export type GifFps = Schema.Schema.Type<typeof GifFps>;

export const GIF_FPS_OPTIONS: readonly GifFps[] = [8, 12, 15];
export const DEFAULT_GIF_FPS: GifFps = 12;

// Size is the LONGER side, not the width: most phone video is portrait, where a
// 640px width would mean a ~1138px tall GIF.
export const GifSize = Schema.Literal(320, 480, 640);
export type GifSize = Schema.Schema.Type<typeof GifSize>;

export const GIF_SIZE_OPTIONS: ReadonlyArray<{
	readonly value: GifSize;
	readonly label: string;
}> = [
	{ value: 320, label: "Small" },
	{ value: 480, label: "Medium" },
	{ value: 640, label: "Large" },
];
export const DEFAULT_GIF_SIZE: GifSize = 480;

// palettegen holds every frame until the end of the range. At the corner
// (15s × 15fps × 640px) that is ~225 scaled frames, about 80-140 MB.
export const MAX_GIF_SECONDS = 15;
export const DEFAULT_GIF_SECONDS = 5;

// The selection a freshly opened video starts with: the first 5 seconds.
export const initialGifEnd = (duration: number): number =>
	Math.min(duration, DEFAULT_GIF_SECONDS);

// Output dimensions that fit the longer side into `longSide`, keeping the
// aspect ratio and never upscaling. Null when the source has no picture.
export const fitLongSide = (
	width: number,
	height: number,
	longSide: number,
): { readonly width: number; readonly height: number } | null => {
	if (width <= 0 || height <= 0) return null;
	const scale = Math.min(1, longSide / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
};

// Draws an image file onto a canvas for the picker to read. Unlike the palette
// extractor this runs on the main thread: a picker reads a few pixels on every
// pointer move, and a worker round trip per move would lag. The browser still
// decodes off-thread inside `createImageBitmap`.

import { Effect } from "effect";

import { FileTooLargeError } from "#/lib/image/errors.ts";
import { MAX_FILE_BYTES } from "#/lib/image/types.ts";

import { ColorImageError } from "./errors.ts";
import type { PixelSize } from "./sample.ts";

/**
 * The longest side kept. A 12,000 px photo is about 430 MB of pixels, which
 * would crash a phone tab. Larger images shrink to this by nearest neighbor.
 */
export const MAX_SIDE = 4096;

export interface PaintedImage extends PixelSize {
	readonly context: CanvasRenderingContext2D;
	/** True when the image was larger than `MAX_SIDE` and was shrunk to fit. */
	readonly shrunk: boolean;
}

export type PaintImageError = FileTooLargeError | ColorImageError;

interface Decoded {
	readonly bitmap: ImageBitmap;
	readonly shrunk: boolean;
}

// Nearest neighbor keeps every pixel a real pixel of the file. A smooth resize
// would average neighbors, and a picked color would no longer be in the image.
async function decode(file: File): Promise<Decoded> {
	const original = await createImageBitmap(file);
	const longest = Math.max(original.width, original.height);

	if (longest <= MAX_SIDE) return { bitmap: original, shrunk: false };

	const scale = MAX_SIDE / longest;

	try {
		const bitmap = await createImageBitmap(original, {
			resizeWidth: Math.max(1, Math.round(original.width * scale)),
			resizeHeight: Math.max(1, Math.round(original.height * scale)),
			resizeQuality: "pixelated",
		});

		// A browser that ignores the resize options hands back the full image.
		// Drawing it would make the oversized canvas this limit exists to prevent.
		if (Math.max(bitmap.width, bitmap.height) > MAX_SIDE) {
			bitmap.close();

			throw new Error("The browser did not shrink the image.");
		}

		return { bitmap, shrunk: true };
	} finally {
		original.close();
	}
}

/** Decodes `file` and draws it at full size on `canvas`. The decoded bitmap is closed when the effect ends. */
export const paintImage = (
	file: File,
	canvas: HTMLCanvasElement,
): Effect.Effect<PaintedImage, PaintImageError> =>
	Effect.gen(function* () {
		if (file.size > MAX_FILE_BYTES) {
			return yield* Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`,
				}),
			);
		}

		return yield* Effect.acquireUseRelease(
			Effect.tryPromise({
				try: () => decode(file),
				catch: (cause) => {
					console.error(cause);

					return new ColorImageError({
						fileName: file.name,
						message: "Couldn't open this file as an image.",
					});
				},
			}),
			({ bitmap, shrunk }) =>
				Effect.try({
					try: () => {
						canvas.width = bitmap.width;
						canvas.height = bitmap.height;

						// "srgb" so a Display P3 photo is read as sRGB, the space the
						// formats on the page describe. Repeat calls return the same context.
						const context = canvas.getContext("2d", {
							willReadFrequently: true,
							colorSpace: "srgb",
						});

						if (!context) throw new Error("No 2D canvas context.");

						context.clearRect(0, 0, bitmap.width, bitmap.height);
						context.drawImage(bitmap, 0, 0);

						return {
							context,
							shrunk,
							width: bitmap.width,
							height: bitmap.height,
						};
					},
					catch: (cause) => {
						console.error(cause);

						return new ColorImageError({
							fileName: file.name,
							message: "Couldn't draw this image.",
						});
					},
				}),
			({ bitmap }) => Effect.sync(() => bitmap.close()),
		);
	});

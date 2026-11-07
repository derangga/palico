import type { PixelSize } from "./pdf-compress-presets.ts";
import type { EncodedImage, ImageCodec } from "./pdf-compress.ts";

// The browser's half of the PDF compressor's image pass: decode with
// createImageBitmap, shrink on an OffscreenCanvas, encode with convertToBlob.
// Worker-only, since the worker is where OffscreenCanvas is used. Kept apart
// from pdf-compress.ts so that file can run in node under vitest.

const encode = async (
	bitmap: ImageBitmap,
	quality: number,
): Promise<EncodedImage> => {
	const { width, height } = bitmap;
	const canvas = new OffscreenCanvas(width, height);

	try {
		const ctx = canvas.getContext("2d");

		if (!ctx) throw new Error("Could not get a 2D canvas context.");

		// JPEG has no alpha. A source pixel can never be see-through here, but the
		// canvas starts transparent, which encodes as black if one ever were.
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, width, height);
		ctx.drawImage(bitmap, 0, 0);

		const blob = await canvas.convertToBlob({ type: "image/jpeg", quality });

		// convertToBlob does not fail on a type it cannot write; it returns a PNG.
		if (blob.type !== "image/jpeg") {
			throw new Error("This browser cannot encode JPEG.");
		}

		return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
	} finally {
		// Free the backing store before the next image allocates its own, on
		// every path, including a failed encode.
		canvas.width = 0;
		canvas.height = 0;
	}
};

const resizeOptions = (resize: PixelSize | null): ImageBitmapOptions =>
	resize
		? {
				resizeWidth: resize.width,
				resizeHeight: resize.height,
				resizeQuality: "high",
			}
		: {};

// A PDF ignores a JPEG's EXIF orientation and applies its own colour space, so
// the pixels must come out as stored. Orientation is not optional: without it a
// phone photo would be turned. The colour conversion is: a browser that
// rejects it still returns the stored pixels for the untagged JPEGs a PDF
// holds, so the probe drops it before it gives up.
type JpegDecodeOptions = ImageBitmapOptions;

const STRICT_DECODE: JpegDecodeOptions = {
	imageOrientation: "none",
	colorSpaceConversion: "none",
};

const ORIENTATION_ONLY: JpegDecodeOptions = { imageOrientation: "none" };

// A real 1x1 JPEG from this browser's own encoder, so the probe tests the same
// path the pass uses.
const probeJpeg = async (): Promise<Blob | null> => {
	if (!("OffscreenCanvas" in globalThis)) return null;

	const canvas = new OffscreenCanvas(1, 1);

	try {
		canvas.getContext("2d")?.fillRect(0, 0, 1, 1);

		const blob = await canvas.convertToBlob({
			type: "image/jpeg",
			quality: 0.5,
		});

		return blob.type === "image/jpeg" ? blob : null;
	} catch {
		return null;
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
};

const decodes = (blob: Blob, options: JpegDecodeOptions): Promise<boolean> =>
	createImageBitmap(blob, options).then(
		(bitmap) => {
			bitmap.close();

			return true;
		},
		() => false,
	);

export const createBrowserImageCodec = (): ImageCodec => {
	let jpegOptions: JpegDecodeOptions = STRICT_DECODE;

	return {
		async probe() {
			if (!("createImageBitmap" in globalThis)) return false;

			const blob = await probeJpeg();

			if (blob === null) return false;

			if (await decodes(blob, STRICT_DECODE)) {
				jpegOptions = STRICT_DECODE;

				return true;
			}

			if (await decodes(blob, ORIENTATION_ONLY)) {
				jpegOptions = ORIENTATION_ONLY;

				return true;
			}

			return false;
		},

		async fromJpeg(source, resize, quality) {
			const bitmap = await createImageBitmap(
				// slice(): a view of the PDF's whole buffer is not a valid BlobPart.
				new Blob([source.slice()], { type: "image/jpeg" }),
				{ ...resizeOptions(resize), ...jpegOptions },
			);

			try {
				return await encode(bitmap, quality);
			} finally {
				bitmap.close();
			}
		},

		async fromRgba(rgba, size, resize, quality) {
			const bitmap = await createImageBitmap(
				new ImageData(rgba, size.width, size.height),
				resizeOptions(resize),
			);

			try {
				return await encode(bitmap, quality);
			} finally {
				bitmap.close();
			}
		},
	};
};

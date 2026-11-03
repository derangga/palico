import { Effect } from "effect";

import type { MetadataParseError, UnsupportedFormatError } from "./errors.ts";
import {
	type ImageFormat,
	type Layout,
	parseImage,
	REMOVABLE,
	readExif,
} from "./image-read.ts";

// Lossless metadata removal: copy every segment the reader marks as "keep" or
// "icc" and the image data verbatim, drop the rest. Nothing is decoded or
// re-encoded, so the output is pixel-identical and keeps its colour profile.

// A 36-byte APP1 holding only the Orientation tag (big-endian TIFF, one IFD0
// entry, no next IFD). Written in place of the original EXIF when the photo
// relies on orientation to display upright.
// One row per structure keeps the byte layout readable.
// oxfmt-ignore
export const minimalExifApp1 = (orientation: number): Uint8Array =>
	Uint8Array.from([
		0xff, 0xe1, 0x00, 0x22,
		// "Exif\0\0"
		0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
		// TIFF header: "MM", 42, IFD0 at offset 8
		0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
		// one entry: tag 0x0112, type SHORT, count 1, value
		0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,
		0x00, orientation & 0xff, 0x00, 0x00,
		// next IFD: none
		0x00, 0x00, 0x00, 0x00,
	]);

const concat = (parts: ReadonlyArray<Uint8Array>): Uint8Array<ArrayBuffer> => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;

	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}

	return out;
};

const stripJpeg = (b: Uint8Array, layout: Layout): Uint8Array<ArrayBuffer> => {
	const parts: Uint8Array[] = [b.subarray(0, 2)];
	let orientationWritten = false;

	for (const s of layout.segments) {
		if (s.kind === "exif" && !orientationWritten) {
			orientationWritten = true;
			const { orientation } = readExif(b, s.dataStart, s.dataEnd);

			if (orientation !== 1) parts.push(minimalExifApp1(orientation));
		} else if (!REMOVABLE.has(s.kind)) {
			parts.push(b.subarray(s.start, s.end));
		}
	}

	parts.push(b.subarray(layout.tailStart));

	return concat(parts);
};

const stripPng = (b: Uint8Array, layout: Layout): Uint8Array<ArrayBuffer> =>
	concat([
		b.subarray(0, 8),
		...layout.segments
			.filter((s) => !REMOVABLE.has(s.kind))
			.map((s) => b.subarray(s.start, s.end)),
	]);

// VP8X flag bits (RFC 9649): ICC 0x20, alpha 0x10, EXIF 0x08, XMP 0x04, anim 0x02.
const VP8X_EXIF_XMP = 0x08 | 0x04;

const stripWebp = (b: Uint8Array, layout: Layout): Uint8Array<ArrayBuffer> => {
	const parts: Uint8Array[] = [b.slice(0, 12)];

	for (const s of layout.segments) {
		if (REMOVABLE.has(s.kind)) continue;

		if (s.name === "VP8X") {
			const chunk = b.slice(s.start, s.end);
			chunk[8] &= ~VP8X_EXIF_XMP;
			parts.push(chunk);
		} else {
			parts.push(b.subarray(s.start, s.end));
		}
	}

	const out = concat(parts);
	new DataView(out.buffer).setUint32(4, out.length - 8, true);

	return out;
};

const STRIPPERS: Record<
	ImageFormat,
	(b: Uint8Array, layout: Layout) => Uint8Array<ArrayBuffer>
> = { jpeg: stripJpeg, png: stripPng, webp: stripWebp };

export const stripImageMetadata = (
	fileName: string,
	bytes: Uint8Array,
): Effect.Effect<
	Uint8Array<ArrayBuffer>,
	MetadataParseError | UnsupportedFormatError
> =>
	parseImage(fileName, bytes).pipe(
		Effect.map((layout) => STRIPPERS[layout.format](bytes, layout)),
	);

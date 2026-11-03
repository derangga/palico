import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
	APP0_JFIF,
	APP2_ICC,
	APP14_ADOBE,
	bytes,
	COM_SEGMENT,
	chunk,
	concat,
	DQT,
	exifSegment,
	ICCP,
	IDAT,
	IEND,
	IHDR,
	jpeg,
	PARIS_GPS,
	PHONE_EXIF,
	PHONE_EXIF_IFD,
	PNG_SIG,
	riffChunk,
	SCAN,
	segment,
	tiff,
	VP8,
	VP8X,
	webp,
	XMP_SEGMENT,
} from "./fixtures.ts";
import { readExif, readImageMetadata } from "./image-read.ts";
import { minimalExifApp1, stripImageMetadata } from "./image-strip.ts";

const strip = (b: Uint8Array) => Effect.runSync(stripImageMetadata("test", b));
const read = (b: Uint8Array) => Effect.runSync(readImageMetadata("test", b));

describe("stripImageMetadata: JPEG", () => {
	const photo = jpeg(
		APP0_JFIF,
		exifSegment(tiff(PHONE_EXIF, { exif: PHONE_EXIF_IFD, gps: PARIS_GPS })),
		XMP_SEGMENT,
		APP2_ICC,
		segment(0xed, bytes("Photoshop 3.0\0IPTC")),
		APP14_ADOBE,
		COM_SEGMENT,
	);

	it("removes every metadata segment and keeps what decoding needs", () => {
		const out = strip(photo);
		expect(read(out)).toEqual({
			fields: [],
			kept: ["colour profile"],
			gps: undefined,
		});
		expect(out).toEqual(
			concat([0xff, 0xd8], APP0_JFIF, APP2_ICC, APP14_ADOBE, DQT, SCAN),
		);
	});

	it("leaves the image data from SOS onward byte-identical", () => {
		const out = strip(photo);
		expect(out.subarray(out.length - SCAN.length)).toEqual(SCAN);
	});

	it("keeps orientation as the only EXIF tag", () => {
		const rotated = jpeg(
			APP0_JFIF,
			exifSegment(tiff([...PHONE_EXIF, [0x0112, 3, 6]], { gps: PARIS_GPS })),
		);

		const out = strip(rotated);
		const report = read(out);
		expect(report.fields).toEqual([]);
		expect(report.kept).toEqual(["orientation"]);
		expect(out).toEqual(
			concat([0xff, 0xd8], APP0_JFIF, minimalExifApp1(6), DQT, SCAN),
		);
		// 2 marker + 2 length + "Exif\0\0" = 10 bytes before the TIFF block.
		expect(
			readExif(out, 2 + APP0_JFIF.length + 4, 2 + APP0_JFIF.length + 36)
				.orientation,
		).toBe(6);
	});

	it("drops orientation 1 entirely", () => {
		const out = strip(jpeg(APP0_JFIF, exifSegment(tiff([[0x0112, 3, 1]]))));
		expect(out).toEqual(jpeg(APP0_JFIF));
	});
});

describe("stripImageMetadata: PNG", () => {
	it("drops eXIf, text and tIME chunks and keeps the rest untouched", () => {
		const b = concat(
			PNG_SIG,
			IHDR,
			ICCP,
			chunk("eXIf", tiff(PHONE_EXIF)),
			chunk("tEXt", bytes("Author\0Jane")),
			chunk("zTXt", bytes("Comment\0\0xx")),
			chunk("tIME", new Uint8Array(7)),
			IDAT,
			IEND,
			bytes("trailing junk"),
		);

		const out = strip(b);
		expect(out).toEqual(concat(PNG_SIG, IHDR, ICCP, IDAT, IEND));
		expect(read(out).fields).toEqual([]);
	});
});

describe("stripImageMetadata: WebP", () => {
	it("drops EXIF and XMP, clears their VP8X flags and fixes the RIFF size", () => {
		const iccp = riffChunk("ICCP", bytes("prof"));

		const b = webp(
			VP8X,
			iccp,
			VP8,
			riffChunk("EXIF", tiff(PHONE_EXIF)),
			riffChunk("XMP ", bytes("<x/>")),
		);

		const out = strip(b);
		const dv = new DataView(out.buffer, out.byteOffset);
		expect(dv.getUint32(4, true)).toBe(out.length - 8);
		// VP8X flags byte: chunk header (8) after RIFF header (12).
		expect(out[20]).toBe(0x20);
		expect(out.subarray(30)).toEqual(concat(iccp, VP8));
		expect(read(out)).toEqual({
			fields: [],
			kept: ["colour profile"],
			gps: undefined,
		});
	});
});

import { Effect, Match, Result } from "effect";
import { describe, expect, it } from "vitest";

import {
	APP0_JFIF,
	APP2_ICC,
	bytes,
	COM_SEGMENT,
	chunk,
	concat,
	exifSegment,
	IDAT,
	IEND,
	IHDR,
	jpeg,
	PARIS_GPS,
	PHONE_EXIF,
	PHONE_EXIF_IFD,
	PNG_SIG,
	riffChunk,
	segment,
	tiff,
	VP8,
	VP8X,
	webp,
	XMP_SEGMENT,
} from "./fixtures.ts";
import { readImageMetadata } from "./image-read.ts";

const read = (b: Uint8Array) => Effect.runSync(readImageMetadata("test", b));

const fieldValue = (b: Uint8Array, label: string) =>
	read(b).fields.find((f) => f.label === label)?.value;

describe("readImageMetadata: JPEG", () => {
	const photo = jpeg(
		APP0_JFIF,
		exifSegment(tiff(PHONE_EXIF, { exif: PHONE_EXIF_IFD, gps: PARIS_GPS })),
		XMP_SEGMENT,
		APP2_ICC,
		COM_SEGMENT,
	);

	it("reads camera, dates, GPS and presence-only segments", () => {
		const report = read(photo);
		expect(fieldValue(photo, "Camera maker")).toBe("Apple");
		expect(fieldValue(photo, "Camera model")).toBe("iPhone 15 Pro");
		expect(fieldValue(photo, "Software")).toBe("17.1");
		expect(fieldValue(photo, "Taken")).toBe("2024-05-01 10:22:33");
		expect(fieldValue(photo, "Lens")).toBe("iPhone 15 Pro back camera");
		expect(fieldValue(photo, "Coordinates")).toBe("48.85840, 2.29450");
		expect(fieldValue(photo, "Altitude")).toBe("35 m");
		expect(fieldValue(photo, "Camera settings")).toBe("1 more tag");
		expect(fieldValue(photo, "XMP data")).toMatch(/B$/);
		expect(fieldValue(photo, "Comment")).toBe("hello");
		expect(report.gps?.lat).toBeCloseTo(48.8584, 4);
		expect(report.kept).toEqual(["colour profile"]);
	});

	it("reads little-endian TIFF and southern/western coordinates", () => {
		const gps = PARIS_GPS.map((t) =>
			Match.value(t[0]).pipe(
				Match.when(1, () => [1, 2, "S"] as const),
				Match.when(3, () => [3, 2, "W"] as const),
				Match.orElse(() => t),
			),
		);

		const b = jpeg(exifSegment(tiff(PHONE_EXIF, { gps, le: true })));
		expect(fieldValue(b, "Camera model")).toBe("iPhone 15 Pro");
		expect(fieldValue(b, "Coordinates")).toBe("-48.85840, -2.29450");
	});

	it("reports an embedded thumbnail and keeps orientation out of the fields", () => {
		const b = jpeg(exifSegment(tiff([[0x0112, 3, 6]], { thumbnail: true })));
		const report = read(b);
		expect(report.fields.map((f) => f.label)).toEqual(["Thumbnail"]);
		expect(report.kept).toEqual(["orientation"]);
	});

	it("finds nothing in a plain JFIF file", () => {
		expect(read(jpeg(APP0_JFIF))).toEqual({
			fields: [],
			kept: [],
			gps: undefined,
		});
	});

	it("fails with MetadataParseError when a segment runs past the end", () => {
		const truncated = concat(
			[0xff, 0xd8],
			segment(0xe1, bytes("Exif\0\0MM")).slice(0, 6),
		);

		const result = Effect.runSync(
			Effect.result(readImageMetadata("broken.jpg", truncated)),
		);

		expect(Result.isFailure(result) && result.failure._tag).toBe(
			"MetadataParseError",
		);
	});

	it("rejects files that are not JPEG, PNG or WebP", () => {
		const result = Effect.runSync(
			Effect.result(readImageMetadata("a.gif", bytes("GIF89a....."))),
		);

		expect(Result.isFailure(result) && result.failure._tag).toBe(
			"UnsupportedFormatError",
		);
	});
});

describe("readImageMetadata: PNG", () => {
	it("reads eXIf, text, iTXt XMP and tIME chunks", () => {
		const time = Uint8Array.from([0x07, 0xe8, 5, 1, 10, 22, 33]);

		const b = concat(
			PNG_SIG,
			IHDR,
			chunk("eXIf", tiff(PHONE_EXIF)),
			chunk("tEXt", bytes("Author\0Jane Doe")),
			chunk("iTXt", bytes("XML:com.adobe.xmp\0\0\0\0\0<x/>")),
			chunk("iTXt", bytes("Comment\0\0\0en\0\0Hi there")),
			chunk("tIME", time),
			IDAT,
			IEND,
		);

		expect(fieldValue(b, "Camera model")).toBe("iPhone 15 Pro");
		expect(fieldValue(b, "Author")).toBe("Jane Doe");
		expect(fieldValue(b, "Comment")).toBe("Hi there");
		expect(fieldValue(b, "XMP data")).toBeDefined();
		expect(fieldValue(b, "Modified")).toBe("2024-05-01 10:22:33");
	});

	it("reports PNG orientation as removable, not kept", () => {
		const b = concat(
			PNG_SIG,
			IHDR,
			chunk("eXIf", tiff([[0x0112, 3, 6]])),
			IDAT,
			IEND,
		);

		const report = read(b);
		expect(report.fields.map((f) => f.label)).toEqual(["Orientation"]);
		expect(report.kept).toEqual([]);
	});
});

describe("readImageMetadata: WebP", () => {
	it("reads the EXIF and XMP chunks of an extended WebP", () => {
		const b = webp(
			VP8X,
			riffChunk("ICCP", bytes("prof")),
			VP8,
			riffChunk("EXIF", tiff(PHONE_EXIF)),
			riffChunk("XMP ", bytes("<x/>")),
		);

		const report = read(b);
		expect(fieldValue(b, "Camera maker")).toBe("Apple");
		expect(fieldValue(b, "XMP data")).toBeDefined();
		expect(report.kept).toEqual(["colour profile"]);
	});
});

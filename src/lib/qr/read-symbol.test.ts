import { describe, expect, it } from "vitest";

import { encodeQrSync } from "./encode.ts";
import { parseSegments, readSymbol } from "./read-symbol.ts";

// Builds a data stream bit by bit, padded with zeros (a terminator) to a byte.
function stream(
	...parts: ReadonlyArray<readonly [value: number, bits: number]>
) {
	const bits: number[] = [];

	for (const [value, length] of parts) {
		for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
	}

	while (bits.length % 8 !== 0 || bits.length < 32) bits.push(0);

	const bytes = new Uint8Array(bits.length / 8);

	bits.forEach((bit, i) => {
		bytes[i >>> 3]! |= bit << (7 - (i & 7));
	});

	return bytes;
}

const VERSION = 1;

// Mode indicator, then a character count whose width depends on the version.
const numeric = (count: number) =>
	[
		[1, 4],
		[count, 10],
	] as const;

const alphanumeric = (count: number) =>
	[
		[2, 4],
		[count, 9],
	] as const;

const bytes = (count: number) =>
	[
		[4, 4],
		[count, 8],
	] as const;

describe("parseSegments", () => {
	it("reads numeric, alphanumeric and byte segments in one stream", () => {
		const data = stream(
			...numeric(4),
			[123, 10],
			[4, 4],
			...alphanumeric(3),
			[Math.floor(10 * 45 + 11), 11],
			[12, 6],
			...bytes(2),
			[0x68, 8],
			[0x69, 8],
		);

		expect(parseSegments(data, VERSION)).toBe("1234ABChi");
	});

	it("keeps leading zeros in numeric segments", () => {
		expect(parseSegments(stream(...numeric(3), [7, 10]), VERSION)).toBe("007");
	});

	it("rejects a numeric group above 999", () => {
		expect(
			parseSegments(stream(...numeric(3), [1023, 10]), VERSION),
		).toBeUndefined();
		expect(
			parseSegments(stream(...numeric(2), [100, 7]), VERSION),
		).toBeUndefined();
	});

	it("rejects an alphanumeric pair that names no characters", () => {
		expect(
			parseSegments(stream(...alphanumeric(2), [2047, 11]), VERSION),
		).toBeUndefined();
		expect(
			parseSegments(stream(...alphanumeric(1), [63, 6]), VERSION),
		).toBeUndefined();
	});

	it("joins back-to-back byte segments, so a split UTF-8 character survives", () => {
		// "é" is 0xC3 0xA9; each byte arrives in its own segment.
		const data = stream(...bytes(1), [0xc3, 8], ...bytes(1), [0xa9, 8]);

		expect(parseSegments(data, VERSION)).toBe("é");
	});

	it("falls back to Latin-1 for bytes that are not valid UTF-8", () => {
		expect(parseSegments(stream(...bytes(1), [0xe9, 8]), VERSION)).toBe("é");
	});

	it("honours an ECI designator for the bytes that follow", () => {
		// ECI 3 is ISO-8859-1; ECI 26 is UTF-8.
		expect(
			parseSegments(stream([7, 4], [3, 8], ...bytes(1), [0xe9, 8]), VERSION),
		).toBe("é");
		expect(
			parseSegments(
				stream([7, 4], [26, 8], ...bytes(2), [0xc3, 8], [0xa9, 8]),
				VERSION,
			),
		).toBe("é");
	});

	it("reads kanji segments", () => {
		// Shift JIS 0x935F (点) is 0x935F - 0x8140 = 0x121F, packed as 0x12 * 0xC0 + 0x1F.
		const value = 0x12 * 0xc0 + 0x1f;

		expect(parseSegments(stream([8, 4], [1, 8], [value, 13]), VERSION)).toBe(
			"点",
		);
	});

	it("gives up on a truncated or unknown segment", () => {
		expect(
			parseSegments(stream(...bytes(40), [0x41, 8]), VERSION),
		).toBeUndefined();
		expect(parseSegments(stream([15, 4], [0, 8]), VERSION)).toBeUndefined();
	});
});

// Built from the code point so the invisible character is visible in source.
const BOM = String.fromCodePoint(0xfeff);

describe("text that must survive a round trip", () => {
	it("keeps a leading byte order mark", () => {
		for (const ecc of ["L", "M", "Q", "H"] as const) {
			const qr = encodeQrSync(BOM + "bom", ecc)!;

			expect(readSymbol(qr.modules, qr.version)?.text).toBe(BOM + "bom");
		}
	});
});

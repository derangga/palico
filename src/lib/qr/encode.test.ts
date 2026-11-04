import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vitest";

import { classify, encodeQr, encodeQrSync, versionFor } from "./encode.ts";
import { formatCodeword, versionCodeword } from "./layout.ts";
import { readSymbol } from "./read-symbol.ts";
import { rsCorrect, rsEncode } from "./reed-solomon.ts";
import {
	alignmentPositions,
	dataCodewords,
	ECC_LEVELS,
	maxCharacters,
	rawDataModules,
	sizeOfVersion,
} from "./tables.ts";

describe("reed-solomon", () => {
	// HELLO WORLD at version 1-M, the worked example in the QR tutorials.
	const data = [
		32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17,
	];
	const check = [196, 35, 39, 119, 235, 215, 231, 226, 93, 23];

	it("produces the known check bytes", () => {
		expect(Array.from(rsEncode(data, 10))).toEqual(check);
	});

	it("repairs up to half the check bytes in errors", () => {
		const block = Uint8Array.from([...data, ...check]);

		for (const [index, flip] of [
			[0, 1],
			[3, 0x55],
			[9, 0x11],
			[14, 0xff],
			[22, 9],
		] as const) {
			block[index]! ^= flip;
		}

		expect(rsCorrect(block, 10)).toBe(true);
		expect(Array.from(block)).toEqual([...data, ...check]);
	});

	it("refuses a block with too many errors", () => {
		const block = Uint8Array.from([...data, ...check]);

		for (const index of [0, 3, 5, 8, 11, 14]) block[index]! ^= 0x33;

		expect(rsCorrect(block, 10)).toBe(false);
	});
});

describe("tables", () => {
	it("matches the published data capacity of version 1", () => {
		expect(ECC_LEVELS.map((ecc) => dataCodewords(1, ecc))).toEqual([
			19, 16, 13, 9,
		]);
	});

	it("matches the published character capacity of version 40", () => {
		const row = (ecc: "L" | "M" | "Q" | "H") => [
			maxCharacters("numeric", 40, ecc),
			maxCharacters("alphanumeric", 40, ecc),
			maxCharacters("byte", 40, ecc),
		];

		expect(row("L")).toEqual([7089, 4296, 2953]);
		expect(row("M")).toEqual([5596, 3391, 2331]);
		expect(row("Q")).toEqual([3993, 2420, 1663]);
		expect(row("H")).toEqual([3057, 1852, 1273]);
	});

	it("matches known module counts and alignment positions", () => {
		expect(rawDataModules(1)).toBe(208);
		expect(rawDataModules(7)).toBe(1568);
		expect(rawDataModules(40)).toBe(29648);
		expect(alignmentPositions(1)).toEqual([]);
		expect(alignmentPositions(2)).toEqual([6, 18]);
		expect(alignmentPositions(7)).toEqual([6, 22, 38]);
		expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
		expect(sizeOfVersion(40)).toBe(177);
	});

	it("gives every version a whole number of data codewords", () => {
		for (let version = 1; version <= 40; version++) {
			for (const ecc of ECC_LEVELS)
				expect(dataCodewords(version, ecc)).toBeGreaterThan(0);
		}
	});
});

describe("format and version words", () => {
	it("matches the spec examples", () => {
		// Level M mask 0, level L mask 0, level H mask 0 (ISO/IEC 18004 table C.1).
		expect(formatCodeword("M", 0)).toBe(0b101010000010010);
		expect(formatCodeword("L", 0)).toBe(0b111011111000100);
		expect(formatCodeword("H", 0)).toBe(0b001011010001001);
		expect(versionCodeword(7)).toBe(0b000111110010010100);
	});
});

describe("classify", () => {
	it("picks the densest mode that holds every character", () => {
		expect(classify("0123456789").mode).toBe("numeric");
		expect(classify("HELLO WORLD").mode).toBe("alphanumeric");
		expect(classify("hello").mode).toBe("byte");
		expect(classify("https://x.io").mode).toBe("byte");
	});

	it("counts bytes, not characters, for text outside ASCII", () => {
		expect(classify("héllo").length).toBe(6);
		expect(classify("日本").length).toBe(6);
	});

	it("fits more digits than bytes in the same version", () => {
		expect(versionFor("1".repeat(100), "M")).toBeLessThan(
			versionFor("a".repeat(100), "M")!,
		);
	});
});

describe("encodeQr", () => {
	it("draws the three finder patterns and the timing lines", () => {
		const qr = encodeQrSync("HELLO WORLD", "Q")!;
		const at = (x: number, y: number) => qr.modules[y * qr.size + x];

		expect(qr.version).toBe(1);
		expect(qr.size).toBe(21);

		for (const [ox, oy] of [
			[0, 0],
			[14, 0],
			[0, 14],
		] as const) {
			expect(at(ox, oy)).toBe(1);
			expect(at(ox + 3, oy + 3)).toBe(1);
			expect(at(ox + 1, oy + 1)).toBe(0);
		}

		for (let i = 8; i < 13; i++) {
			expect(at(i, 6)).toBe(i % 2 === 0 ? 1 : 0);
			expect(at(6, i)).toBe(i % 2 === 0 ? 1 : 0);
		}
	});

	it("is deterministic", () => {
		expect(Array.from(encodeQrSync("same", "M")!.modules)).toEqual(
			Array.from(encodeQrSync("same", "M")!.modules),
		);
	});

	it("fails with a typed error when the text cannot fit", () => {
		const exit = Effect.runSyncExit(encodeQr("a".repeat(3000), "L"));

		expect(Exit.isFailure(exit)).toBe(true);

		const failure = Exit.isFailure(exit)
			? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
			: undefined;

		expect(failure?._tag).toBe("QrCapacityError");
		expect(failure?.limit).toBe(2953);
	});

	it("moves to a bigger version as the text grows", () => {
		const versions = [10, 60, 200, 700].map(
			(n) => encodeQrSync("x".repeat(n), "M")!.version,
		);

		expect(versions).toEqual([...versions].sort((a, b) => a - b));
		expect(new Set(versions).size).toBe(4);
	});
});

describe("round trip through the symbol layer", () => {
	const texts = [
		"1",
		"0123456789012345678901234567890123456789",
		"HELLO WORLD",
		"https://palico.rangga.site/qr-generator?x=1&y=two",
		"héllo wörld ✓ 日本語 🙂",
		"WIFI:T:WPA;S:Cafe Net;P:p@ss;word;;",
		"line one\nline two\ttabbed",
		"A".repeat(500),
		"z".repeat(900),
	];

	for (const ecc of ECC_LEVELS) {
		it(`reads back every text at level ${ecc}`, () => {
			for (const text of texts) {
				const qr = encodeQrSync(text, ecc)!;
				const reading = readSymbol(qr.modules, qr.version);

				expect(reading?.text).toBe(text);
				expect(reading?.ecc).toBe(ecc);
				expect(reading?.version).toBe(qr.version);
			}
		});
	}

	it("survives damage within the error correction budget", () => {
		const qr = encodeQrSync("https://palico.rangga.site/qr-generator", "H")!;
		const damaged = qr.modules.slice();

		// Wipe a 4 x 4 patch of data modules away from the finders.
		for (let y = 12; y < 16; y++) {
			for (let x = 12; x < 16; x++) damaged[y * qr.size + x]! ^= 1;
		}

		expect(readSymbol(damaged, qr.version)?.text).toBe(
			"https://palico.rangga.site/qr-generator",
		);
	});
});

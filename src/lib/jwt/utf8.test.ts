import { describe, expect, it } from "vitest";

import { decodeUtf8, showInvalidBytes } from "./utf8.ts";

const show = (...bytes: ReadonlyArray<number>) =>
	showInvalidBytes(decodeUtf8(Uint8Array.from(bytes)));

describe("valid text", () => {
	it("reads ASCII, accents, CJK and emoji unchanged", () => {
		const text = "abc é 日本語 😀";

		expect(showInvalidBytes(decodeUtf8(new TextEncoder().encode(text)))).toBe(
			text,
		);
	});
});

describe("invalid bytes", () => {
	it("writes a stray high byte as \\xHH and keeps its neighbours", () => {
		expect(show(0x61, 0xff, 0x62)).toBe("a\\xFFb");
	});

	it("writes each byte of a truncated sequence", () => {
		// 0xe2 0x82 starts a three-byte sequence and stops.
		expect(show(0x61, 0xe2, 0x82)).toBe("a\\xE2\\x82");
	});

	it("refuses an overlong form of NUL", () => {
		expect(show(0xc0, 0x80)).toBe("\\xC0\\x80");
	});

	it("refuses an encoded surrogate", () => {
		expect(show(0xed, 0xa0, 0x80)).toBe("\\xED\\xA0\\x80");
	});

	it("refuses a code point past U+10FFFF", () => {
		expect(show(0xf4, 0x90, 0x80, 0x80)).toBe("\\xF4\\x90\\x80\\x80");
	});

	it("keeps valid text on either side of a bad byte", () => {
		const bytes = [
			...new TextEncoder().encode("é"),
			0x80,
			...new TextEncoder().encode("日"),
		];

		expect(show(...bytes)).toBe("é\\x80日");
	});
});

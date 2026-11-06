import { describe, expect, it } from "vitest";

import { decodeBase64Url } from "./base64url.ts";

const bytesOf = (text: string) => {
	const result = decodeBase64Url(text);

	if (result.kind !== "bytes")
		throw new Error(`expected bytes, got ${result.kind}`);

	return Buffer.from(result.bytes).toString("latin1");
};

describe("padding", () => {
	// 1, 2 and 3 bytes need 2, 3 and 0 padding characters in standard Base64.
	it.each([
		["Zg", "f"],
		["Zm8", "fo"],
		["Zm9v", "foo"],
		["Zm9vYg", "foob"],
	])("reads %s without padding", (text, expected) => {
		expect(bytesOf(text)).toBe(expected);
	});

	it.each([
		["Zg==", "f"],
		["Zm8=", "fo"],
	])("reads %s with padding", (text, expected) => {
		expect(bytesOf(text)).toBe(expected);
	});

	it("reads an empty part as no bytes", () => {
		expect(bytesOf("")).toBe("");
	});
});

describe("alphabet", () => {
	it("reads - and _ where standard Base64 has + and /", () => {
		// 0xfb 0xff 0xfe is "+//+" in standard Base64.
		expect(Buffer.from("-__-", "base64url").toString("hex")).toBe("fbfffe");

		const result = decodeBase64Url("-__-");

		expect(
			result.kind === "bytes" && Buffer.from(result.bytes).toString("hex"),
		).toBe("fbfffe");
	});

	it("rejects + and / and says where", () => {
		expect(decodeBase64Url("ab+d")).toEqual({
			kind: "bad-char",
			index: 2,
			char: "+",
		});

		expect(decodeBase64Url("ab/d").kind).toBe("bad-char");
	});

	it("rejects spaces and dots", () => {
		expect(decodeBase64Url("ab cd").kind).toBe("bad-char");
		expect(decodeBase64Url("ab.cd").kind).toBe("bad-char");
	});
});

describe("length", () => {
	it("rejects a length that leaves one stray character", () => {
		expect(decodeBase64Url("abcde")).toEqual({ kind: "bad-length" });
		expect(decodeBase64Url("a")).toEqual({ kind: "bad-length" });
	});
});

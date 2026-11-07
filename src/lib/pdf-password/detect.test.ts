import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
	detectEncryption,
	modeAfterDetect,
	modeHint,
	suggestMode,
} from "./detect.ts";

const latin1 = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

const PLAIN =
	"%PDF-1.7\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";

const detect = (text: string) =>
	Effect.runPromise(detectEncryption(new Blob([latin1(text)])));

describe("detectEncryption", () => {
	it("is plain for a PDF with no /Encrypt", async () => {
		expect(await detect(PLAIN)).toBe("plain");
	});

	it("finds an indirect /Encrypt in a classic trailer", async () => {
		expect(
			await detect(
				`${PLAIN}\ntrailer<</Root 1 0 R/Encrypt 7 0 R/ID[<aa><aa>]>>`,
			),
		).toBe("encrypted");
	});

	it("finds a direct /Encrypt dictionary", async () => {
		expect(
			await detect(`${PLAIN}\ntrailer<</Encrypt<</Filter/Standard/V 5>>>>`),
		).toBe("encrypted");
	});

	it("finds /Encrypt in an xref stream dictionary", async () => {
		expect(
			await detect(
				`${PLAIN}\n9 0 obj<</Type/XRef/Size 10/Root 1 0 R/Encrypt 8 0 R/W[1 2 1]>>stream\n`,
			),
		).toBe("encrypted");
	});

	it("finds it far into a large file", async () => {
		const filler = "x".repeat(3 * 1024 * 1024 + 17);

		expect(await detect(`${PLAIN}${filler}\ntrailer<</Encrypt 4 0 R>>`)).toBe(
			"encrypted",
		);
	});

	it("finds it when it straddles a slice boundary", async () => {
		// The key begins five bytes before the first 1 MB boundary.
		const pdf = `${"x".repeat(1024 * 1024 - 5)}/Encrypt 4 0 R`;

		expect(await detect(pdf)).toBe("encrypted");
	});

	it("ignores the word Encrypt when it is not the trailer key", async () => {
		expect(await detect(`${PLAIN}\n(see /Encrypted files)`)).toBe("plain");
	});
});

describe("suggestMode", () => {
	it("suggests Unlock for a file with a password", () => {
		expect(suggestMode("encrypted")).toBe("unlock");
	});

	it("suggests Protect for a file without one", () => {
		expect(suggestMode("plain")).toBe("protect");
	});
});

describe("modeHint", () => {
	it("offers Unlock to a locked file on Protect", () => {
		expect(modeHint("protect", "encrypted")).toBe("unlock");
	});

	it("offers Protect to a file with no password on Unlock", () => {
		expect(modeHint("unlock", "plain")).toBe("protect");
	});

	it("says nothing when the file belongs in the mode", () => {
		expect(modeHint("protect", "plain")).toBeUndefined();
		expect(modeHint("unlock", "encrypted")).toBeUndefined();
	});
});

describe("modeAfterDetect", () => {
	it("moves an untouched switch to the file's mode", () => {
		expect(modeAfterDetect("protect", false, "encrypted")).toBe("unlock");
		expect(modeAfterDetect("unlock", false, "plain")).toBe("protect");
	});

	it("never moves a switch the person has chosen", () => {
		expect(modeAfterDetect("protect", true, "encrypted")).toBe("protect");
		expect(modeAfterDetect("unlock", true, "plain")).toBe("unlock");
	});
});

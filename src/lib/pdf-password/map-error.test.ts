import { describe, expect, it } from "vitest";

import { toCryptError } from "./map-error.ts";
import { CryptFailReason } from "./shapes.ts";

describe("toCryptError", () => {
	it("gives every failure reason its own tagged error", () => {
		const tags = Object.fromEntries(
			CryptFailReason.literals.map((reason) => [
				reason,
				toCryptError("a.pdf", reason, undefined)._tag,
			]),
		);

		expect(tags).toEqual({
			"wrong-password": "WrongPasswordError",
			"unsupported-encryption": "UnsupportedEncryptionError",
			"not-encrypted": "NotEncryptedError",
			"source-encrypted": "AlreadyEncryptedError",
			invalid: "InvalidPdfError",
			"verify-failed": "OutputVerificationError",
			"engine-load": "PdfEngineLoadError",
			worker: "PdfWorkerError",
		});
	});

	it("words the certificate case the way the product promises", () => {
		expect(
			toCryptError("a.pdf", "unsupported-encryption", undefined).message,
		).toContain("locked with a certificate, not a password");
	});

	it("turns an unknown reason into a worker error instead of failing silently", () => {
		const error = toCryptError("a.pdf", "something-new", "boom");

		expect(error._tag).toBe("PdfWorkerError");
		expect(error.message).toBe("boom");
	});

	it("names the file on the errors that carry it", () => {
		expect(toCryptError("a.pdf", "invalid", undefined)).toMatchObject({
			fileName: "a.pdf",
		});
	});
});

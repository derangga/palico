import { describe, expect, it } from "vitest";

import { keyKindOf, readAlgorithm, SUPPORTED } from "./algorithms.ts";

describe("readAlgorithm", () => {
	it.each([
		"HS256",
		"HS384",
		"HS512",
		"RS256",
		"RS384",
		"RS512",
		"PS256",
		"PS384",
		"PS512",
		"ES256",
		"ES384",
		"ES512",
	])("supports %s", (alg) => {
		expect(readAlgorithm(alg)).toMatchObject({
			kind: "supported",
			spec: { alg },
		});
	});

	it("lists twelve algorithms", () => {
		expect(SUPPORTED).toHaveLength(12);
	});

	it("maps ES512 to the P-521 curve and PS384 to a 48-byte salt", () => {
		expect(readAlgorithm("ES512")).toMatchObject({
			spec: { family: "ecdsa", curve: "P-521", hash: "SHA-512" },
		});

		expect(readAlgorithm("PS384")).toMatchObject({
			spec: { family: "rsa-pss", saltLength: 48 },
		});
	});

	it("treats none as its own case, whatever its capitals", () => {
		expect(readAlgorithm("none")).toEqual({ kind: "none" });
		expect(readAlgorithm("nOnE")).toEqual({ kind: "none" });
		expect(readAlgorithm("NONE")).toEqual({ kind: "none" });
	});

	it("does not accept a name in the wrong case", () => {
		expect(readAlgorithm("hs256").kind).toBe("unsupported");
	});

	it.each(["EdDSA", "ES256K", "RSA-OAEP", "HS1", ""])(
		"reports %j as unsupported and names it",
		(alg) => {
			const reading = readAlgorithm(alg);

			expect(reading.kind).toBe("unsupported");

			if (reading.kind === "unsupported") {
				expect(reading.error._tag).toBe("UnsupportedAlgorithmError");
				expect(reading.error.alg).toBe(alg);
				expect(reading.error.message).toContain("HS256");
			}
		},
	);

	it("reports a header with no alg", () => {
		const reading = readAlgorithm(undefined);

		expect(reading.kind).toBe("unsupported");

		if (reading.kind === "unsupported") {
			expect(reading.error.alg).toBe("");
			expect(reading.error.message).toMatch(/no alg/);
		}
	});
});

describe("keyKindOf", () => {
	it("asks for a secret for HMAC and a public key for the rest", () => {
		const kind = (alg: string) => {
			const reading = readAlgorithm(alg);

			if (reading.kind !== "supported") throw new Error(alg);

			return keyKindOf(reading.spec);
		};

		expect(kind("HS256")).toBe("secret");
		expect(kind("RS256")).toBe("public");
		expect(kind("PS256")).toBe("public");
		expect(kind("ES256")).toBe("public");
	});
});

import { createHmac } from "node:crypto";

import { Cause, Effect, Exit, Option } from "effect";
import { beforeAll, describe, expect, it } from "vitest";

import { buildExampleToken, EXAMPLE_SECRET } from "./example.ts";
import type { KeyInput } from "./keys.ts";
import {
	base64url,
	decode,
	jwtIoSample,
	pemOf,
	tamper,
} from "./test-helpers.ts";
import { verifyToken } from "./verify.ts";

// Written out here and not read from algorithms.ts, so a wrong entry there fails
// instead of agreeing with itself.
const HASH = { "256": "SHA-256", "384": "SHA-384", "512": "SHA-512" } as const;
const BYTES = { "256": 32, "384": 48, "512": 64 } as const;
const CURVE = { "256": "P-256", "384": "P-384", "512": "P-521" } as const;
const SIZES = ["256", "384", "512"] as const;

/** `verified`, `not-verified`, or the tag of the error that stopped the check. */
async function outcome(token: string, input: KeyInput): Promise<string> {
	const exit = await Effect.runPromiseExit(verifyToken(decode(token), input));

	if (Exit.isSuccess(exit)) return exit.value;

	const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

	return error ? error._tag : "defect";
}

const secret = (text: string, base64 = false): KeyInput => ({
	kind: "secret",
	text,
	base64url: base64,
});

const publicKey = (text: string): KeyInput => ({ kind: "public", text });

const PAYLOAD = '{"sub":"1234567890","iat":1516239022}';

const parts = (token: string) => {
	const [header, payload, signature] = token.split(".");

	return {
		header: header ?? "",
		payload: payload ?? "",
		signature: signature ?? "",
	};
};

describe("known vectors", () => {
	it("verifies the jwt.io HS256 sample", async () => {
		const sample = jwtIoSample();

		// The signature jwt.io publishes for this header and payload, so the fixture
		// itself is checked against an outside source.
		expect(
			sample.endsWith(".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
		).toBe(true);

		expect(await outcome(sample, secret("your-256-bit-secret"))).toBe(
			"verified",
		);
		expect(await outcome(sample, secret("your-256-bit-secreT"))).toBe(
			"not-verified",
		);
	});

	it("verifies the example token with its secret", async () => {
		const token = await Effect.runPromise(buildExampleToken());

		expect(await outcome(token, secret(EXAMPLE_SECRET))).toBe("verified");
		expect(await outcome(token, secret("palico-demo "))).toBe("not-verified");
	});
});

describe.each(SIZES)("HS%s", (size) => {
	const alg = `HS${size}`;

	const hmac = (input: string, key: string | Buffer) =>
		createHmac(`sha${size}`, key).update(input).digest("base64url");

	const build = (key: string | Buffer) => {
		const input = `${base64url(JSON.stringify({ alg }))}.${base64url(PAYLOAD)}`;

		return `${input}.${hmac(input, key)}`;
	};

	it("verifies with the right secret", async () => {
		expect(await outcome(build("shh"), secret("shh"))).toBe("verified");
	});

	it("does not verify with the wrong secret", async () => {
		expect(await outcome(build("shh"), secret("shhh"))).toBe("not-verified");
	});

	it("does not verify when one byte of the signature changes", async () => {
		const { header, payload, signature } = parts(build("shh"));

		expect(
			await outcome(`${header}.${payload}.${tamper(signature)}`, secret("shh")),
		).toBe("not-verified");
	});

	it("does not verify when the payload changes", async () => {
		const { header, signature } = parts(build("shh"));
		const forged = base64url('{"sub":"1234567891","iat":1516239022}');

		expect(
			await outcome(`${header}.${forged}.${signature}`, secret("shh")),
		).toBe("not-verified");
	});

	it("reads the secret as Base64url when told to", async () => {
		const raw = Buffer.from([0, 1, 2, 250, 251, 252]);

		expect(await outcome(build(raw), secret(base64url(raw), true))).toBe(
			"verified",
		);
		expect(await outcome(build(raw), secret(base64url(raw), false))).toBe(
			"not-verified",
		);
	});

	it("reads a Base64 secret written in the standard alphabet too", async () => {
		const raw = Buffer.from([0xfb, 0xff, 0xfe, 1, 2, 3]);

		// "+//+" is how standard Base64 writes the first three bytes.
		expect(raw.toString("base64")).toContain("+//");
		expect(
			await outcome(build(raw), secret(raw.toString("base64"), true)),
		).toBe("verified");
	});

	it("says a Base64url secret that is not Base64url is a key problem", async () => {
		expect(await outcome(build("shh"), secret("not base64!", true))).toBe(
			"InvalidKeyError",
		);
	});
});

interface Pair {
	readonly token: (extra?: { kid?: string }) => Promise<string>;
	readonly pem: string;
	readonly jwk: JsonWebKey;
	readonly privateJwk: JsonWebKey;
}

type Family = "RS" | "PS" | "ES";

type Size = (typeof SIZES)[number];

const signParamsOf = (
	family: Family,
	size: Size,
): AlgorithmIdentifier | RsaPssParams | EcdsaParams => {
	switch (family) {
		case "ES":
			return { name: "ECDSA", hash: HASH[size] };
		case "PS":
			return { name: "RSA-PSS", saltLength: BYTES[size] };
		case "RS":
			return { name: "RSASSA-PKCS1-v1_5" };
	}
};

async function makePair(family: Family, size: Size): Promise<Pair> {
	const alg = `${family}${size}`;

	const algorithm =
		family === "ES"
			? { name: "ECDSA", namedCurve: CURVE[size] }
			: {
					name: family === "RS" ? "RSASSA-PKCS1-v1_5" : "RSA-PSS",
					modulusLength: 2048,
					publicExponent: new Uint8Array([1, 0, 1]),
					hash: HASH[size],
				};

	const pair = await crypto.subtle.generateKey(algorithm, true, [
		"sign",
		"verify",
	]);

	const signParams = signParamsOf(family, size);

	return {
		pem: pemOf(await crypto.subtle.exportKey("spki", pair.publicKey)),
		jwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
		privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
		token: async (extra) => {
			const header = JSON.stringify({ alg, typ: "JWT", ...extra });
			const input = `${base64url(header)}.${base64url(PAYLOAD)}`;

			const signature = await crypto.subtle.sign(
				signParams,
				pair.privateKey,
				new TextEncoder().encode(input),
			);

			return `${input}.${base64url(new Uint8Array(signature))}`;
		},
	};
}

const PUBLIC_ALGS = SIZES.flatMap((size) =>
	(["RS", "PS", "ES"] as const).map((family): [string, Family, Size] => [
		`${family}${size}`,
		family,
		size,
	]),
);

describe.each(PUBLIC_ALGS)("%s", (_alg, family, size) => {
	let pair: Pair;
	let token: string;

	beforeAll(async () => {
		pair = await makePair(family, size);
		token = await pair.token();
	}, 30_000);

	it("verifies with the PEM public key", async () => {
		expect(await outcome(token, publicKey(pair.pem))).toBe("verified");
	});

	it("verifies with the JWK", async () => {
		expect(await outcome(token, publicKey(JSON.stringify(pair.jwk)))).toBe(
			"verified",
		);
	});

	it("does not verify when one byte of the signature changes", async () => {
		const { header, payload, signature } = parts(token);

		expect(
			await outcome(
				`${header}.${payload}.${tamper(signature)}`,
				publicKey(pair.pem),
			),
		).toBe("not-verified");
	});

	it("does not verify when the payload changes", async () => {
		const { header, signature } = parts(token);
		const forged = base64url('{"sub":"someone-else","iat":1516239022}');

		expect(
			await outcome(`${header}.${forged}.${signature}`, publicKey(pair.pem)),
		).toBe("not-verified");
	});

	it("does not throw on a signature of the wrong length", async () => {
		const { header, payload } = parts(token);

		expect(
			await outcome(`${header}.${payload}.AAAA`, publicKey(pair.pem)),
		).toBe("not-verified");
	});

	it("refuses a private JWK", async () => {
		expect(
			await outcome(token, publicKey(JSON.stringify(pair.privateJwk))),
		).toBe("InvalidKeyError");
	});
});

describe("key formats", () => {
	let pair: Pair;
	let other: Pair;
	let token: string;

	beforeAll(async () => {
		pair = await makePair("RS", "256");
		other = await makePair("RS", "256");
		token = await pair.token({ kid: "a" });
	}, 30_000);

	it("reads a PEM whose line breaks were pasted as \\n", async () => {
		expect(
			await outcome(token, publicKey(pair.pem.replaceAll("\n", "\\n"))),
		).toBe("verified");
	});

	it("reads a PEM with extra blank lines and spaces around it", async () => {
		expect(await outcome(token, publicKey(`\n\n  ${pair.pem}  \n`))).toBe(
			"verified",
		);
	});

	it("picks the key from a JWKS by the token's kid", async () => {
		const set = JSON.stringify({
			keys: [
				{ ...other.jwk, kid: "b" },
				{ ...pair.jwk, kid: "a" },
			],
		});

		expect(await outcome(token, publicKey(set))).toBe("verified");
	});

	it("says when no key in the set has the kid", async () => {
		const set = JSON.stringify({ keys: [{ ...pair.jwk, kid: "z" }] });

		expect(await outcome(token, publicKey(set))).toBe("InvalidKeyError");
	});

	it("uses the only key of a set when the token has no kid", async () => {
		const bare = await pair.token();
		const set = JSON.stringify({ keys: [pair.jwk] });

		expect(await outcome(bare, publicKey(set))).toBe("verified");
	});

	it("asks for a kid when the set has several keys and the token has none", async () => {
		const bare = await pair.token();
		const set = JSON.stringify({ keys: [pair.jwk, other.jwk] });

		expect(await outcome(bare, publicKey(set))).toBe("InvalidKeyError");
	});

	it("does not verify with a different key", async () => {
		expect(await outcome(token, publicKey(other.pem))).toBe("not-verified");
	});

	it("refuses a private key PEM", async () => {
		const pem = "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----";

		expect(await outcome(token, publicKey(pem))).toBe("InvalidKeyError");
	});

	it("tells the person how to convert a PKCS#1 key and a certificate", async () => {
		const pkcs1 =
			"-----BEGIN RSA PUBLIC KEY-----\nAAAA\n-----END RSA PUBLIC KEY-----";

		const cert = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----";

		const messageOf = async (text: string) => {
			const exit = await Effect.runPromiseExit(
				verifyToken(decode(token), publicKey(text)),
			);

			const error = Exit.isFailure(exit)
				? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
				: undefined;

			return error?.message ?? "";
		};

		expect(await messageOf(pkcs1)).toContain("openssl rsa");
		expect(await messageOf(cert)).toContain("openssl x509");
	});

	it("refuses text that is neither a PEM nor a JWK", async () => {
		expect(await outcome(token, publicKey("hello"))).toBe("InvalidKeyError");
		expect(await outcome(token, publicKey("{not json"))).toBe(
			"InvalidKeyError",
		);
		expect(await outcome(token, publicKey("{}"))).toBe("InvalidKeyError");
	});
});

describe("a key that does not fit the algorithm", () => {
	it("refuses a P-256 key for an ES384 token", async () => {
		const small = await makePair("ES", "256");
		const big = await makePair("ES", "384");

		expect(await outcome(await big.token(), publicKey(small.pem))).toBe(
			"InvalidKeyError",
		);
	});

	it("refuses an RSA key for an ES256 token", async () => {
		const rsa = await makePair("RS", "256");
		const ec = await makePair("ES", "256");

		expect(await outcome(await ec.token(), publicKey(rsa.pem))).toBe(
			"InvalidKeyError",
		);
	});

	it("does not use a public key as an HMAC secret (alg confusion)", async () => {
		const rsa = await makePair("RS", "256");
		const input = `${base64url('{"alg":"HS256"}')}.${base64url(PAYLOAD)}`;
		const forged = `${input}.${createHmac("sha256", rsa.pem).update(input).digest("base64url")}`;

		expect(await outcome(forged, publicKey(rsa.pem))).toBe("InvalidKeyError");
	});

	it("does not take a public key for an HS256 token, even a JWK of type oct", async () => {
		const input = `${base64url('{"alg":"HS256"}')}.${base64url(PAYLOAD)}`;
		const token = `${input}.${createHmac("sha256", "shh").update(input).digest("base64url")}`;
		const jwk = JSON.stringify({ kty: "oct", k: base64url("shh") });

		expect(await outcome(token, publicKey(jwk))).toBe("InvalidKeyError");
		expect(await outcome(token, publicKey("shh"))).toBe("InvalidKeyError");
	});

	it("does not take a secret for an RS256 token", async () => {
		const rsa = await makePair("RS", "256");

		expect(await outcome(await rsa.token(), secret("shh"))).toBe(
			"InvalidKeyError",
		);
	});
});

describe("algorithms it cannot check", () => {
	const unsigned = (header: string) =>
		`${base64url(header)}.${base64url(PAYLOAD)}.AAAA`;

	it("fails for alg none, whatever its capitals", async () => {
		expect(await outcome(unsigned('{"alg":"none"}'), secret("x"))).toBe(
			"UnsupportedAlgorithmError",
		);

		expect(await outcome(unsigned('{"alg":"nOnE"}'), secret("x"))).toBe(
			"UnsupportedAlgorithmError",
		);
	});

	it("fails for EdDSA, a missing alg and an alg that is not a string", async () => {
		for (const header of ['{"alg":"EdDSA"}', "{}", '{"alg":5}']) {
			expect(await outcome(unsigned(header), secret("x"))).toBe(
				"UnsupportedAlgorithmError",
			);
		}
	});
});

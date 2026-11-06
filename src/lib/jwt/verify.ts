// Checks a token's signature with Web Crypto. A signature that does not match is
// an answer (`not-verified`), not an error. Only a key that cannot be used, or
// an algorithm that cannot be checked, fails.

import { Effect } from "effect";

import { m } from "#/paraglide/messages.js";

import { type AlgorithmSpec, keyKindOf, readAlgorithm } from "./algorithms.ts";
import {
	InvalidKeyError,
	UnsupportedAlgorithmError,
	type VerifyError,
} from "./errors.ts";
import { importKey, type KeyInput } from "./keys.ts";
import type { DecodedToken } from "./token.ts";

export type Verdict = "verified" | "not-verified";

const verifyParams = (
	spec: AlgorithmSpec,
): AlgorithmIdentifier | RsaPssParams | EcdsaParams => {
	switch (spec.family) {
		case "hmac":
			return { name: "HMAC" };
		case "rsa-pkcs1":
			return { name: "RSASSA-PKCS1-v1_5" };
		case "rsa-pss":
			return { name: "RSA-PSS", saltLength: spec.saltLength };
		case "ecdsa":
			// JWS writes an ECDSA signature as r and s side by side, which is what Web Crypto reads.
			return { name: "ECDSA", hash: spec.hash };
	}
};

/** Checks `token`'s signature against the pasted key. */
export const verifyToken = (
	token: DecodedToken,
	input: KeyInput,
): Effect.Effect<Verdict, VerifyError> =>
	Effect.gen(function* () {
		const reading = readAlgorithm(token.alg);

		if (reading.kind === "unsupported")
			return yield* Effect.fail(reading.error);

		if (reading.kind === "none") {
			return yield* Effect.fail(
				new UnsupportedAlgorithmError({
					alg: token.alg ?? "none",
					message: m.jwt_none_body(),
				}),
			);
		}

		// An HS token takes a secret and every other token takes a public key. Web Crypto
		// would refuse the mix too, but this does not lean on that: a public key must
		// never be used as an HMAC secret.
		if (input.kind !== keyKindOf(reading.spec)) {
			return yield* Effect.fail(
				new InvalidKeyError({
					message: m.jwt_err_key_mismatch({ alg: reading.spec.alg }),
				}),
			);
		}

		const key = yield* importKey(reading.spec, input, token.kid);

		// A rejection here is a bug or a browser fault, not a wrong signature. It is left
		// as a defect for the caller to catch, as the converter does for its worker.
		const matches = yield* Effect.promise(() =>
			crypto.subtle.verify(
				verifyParams(reading.spec),
				key,
				token.signature,
				new TextEncoder().encode(token.signingInput),
			),
		);

		return matches ? "verified" : "not-verified";
	});

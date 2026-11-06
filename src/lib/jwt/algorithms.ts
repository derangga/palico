// The signing algorithms Web Crypto can check, from RFC 7518. Anything else is
// reported as unsupported, and `none` is treated as its own case because a token
// that says it needs no signature proves nothing.

import { m } from "#/paraglide/messages.js";

import { UnsupportedAlgorithmError } from "./errors.ts";

export type Hash = "SHA-256" | "SHA-384" | "SHA-512";

export type Curve = "P-256" | "P-384" | "P-521";

export type AlgorithmSpec =
	| { readonly family: "hmac"; readonly alg: string; readonly hash: Hash }
	| { readonly family: "rsa-pkcs1"; readonly alg: string; readonly hash: Hash }
	| {
			readonly family: "rsa-pss";
			readonly alg: string;
			readonly hash: Hash;
			/** RFC 7518 sets the salt as long as the hash output. */
			readonly saltLength: number;
	  }
	| {
			readonly family: "ecdsa";
			readonly alg: string;
			readonly hash: Hash;
			readonly curve: Curve;
	  };

const SIZES = [
	{ bits: "256", hash: "SHA-256", bytes: 32, curve: "P-256" },
	{ bits: "384", hash: "SHA-384", bytes: 48, curve: "P-384" },
	{ bits: "512", hash: "SHA-512", bytes: 64, curve: "P-521" },
] as const;

export const SUPPORTED: ReadonlyArray<AlgorithmSpec> = [
	...SIZES.map(({ bits, hash }): AlgorithmSpec => ({
		family: "hmac",
		alg: `HS${bits}`,
		hash,
	})),
	...SIZES.map(({ bits, hash }): AlgorithmSpec => ({
		family: "rsa-pkcs1",
		alg: `RS${bits}`,
		hash,
	})),
	...SIZES.map(({ bits, hash, bytes }): AlgorithmSpec => ({
		family: "rsa-pss",
		alg: `PS${bits}`,
		hash,
		saltLength: bytes,
	})),
	...SIZES.map(({ bits, hash, curve }): AlgorithmSpec => ({
		family: "ecdsa",
		alg: `ES${bits}`,
		hash,
		curve,
	})),
];

const BY_NAME = new Map(SUPPORTED.map((spec) => [spec.alg, spec]));

export type AlgorithmReading =
	| { readonly kind: "none" }
	| { readonly kind: "supported"; readonly spec: AlgorithmSpec }
	| { readonly kind: "unsupported"; readonly error: UnsupportedAlgorithmError };

/**
 * What the header's `alg` means for checking the signature. Names are case
 * sensitive in the spec, so `hs256` is unsupported. `none` is matched without
 * regard to case, because libraries that did so were attacked with `nOnE`.
 */
export function readAlgorithm(alg: string | undefined): AlgorithmReading {
	if (alg?.toLowerCase() === "none") return { kind: "none" };

	const spec = alg === undefined ? undefined : BY_NAME.get(alg);

	if (spec) return { kind: "supported", spec };

	return {
		kind: "unsupported",
		error: new UnsupportedAlgorithmError({
			alg: alg ?? "",
			message:
				alg === undefined
					? m.jwt_unsupported_missing()
					: m.jwt_unsupported({
							alg,
							supported: SUPPORTED.map((entry) => entry.alg).join(", "),
						}),
		}),
	};
}

/** HMAC needs a shared secret. Every other family needs the signer's public key. */
export const keyKindOf = (spec: AlgorithmSpec): "secret" | "public" =>
	spec.family === "hmac" ? "secret" : "public";

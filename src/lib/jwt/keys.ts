// Turns what a person pastes into a Web Crypto key. A secret becomes HMAC bytes.
// A public key is a PEM (SPKI) or a JWK, or a JWKS from which the token's `kid`
// picks one. Private keys are refused on purpose.

import { Effect } from "effect";

import { currentLocale } from "#/lib/i18n/state.ts";
import { parseJson } from "#/lib/json-converter/json.ts";
import { messageTemplates } from "#/lib/json-converter/texts.ts";
import type { JsonValue } from "#/lib/json-converter/types.ts";
import { isRecord, type JsonRecord } from "#/lib/json-converter/value.ts";
import { m } from "#/paraglide/messages.js";

import type { AlgorithmSpec } from "./algorithms.ts";
import { decodeBase64Url } from "./base64url.ts";
import { InvalidKeyError } from "./errors.ts";
import { stringOf } from "./record.ts";

export type KeyInput =
	| {
			readonly kind: "secret";
			readonly text: string;
			/** The secret is Base64url text for the real bytes, as some systems store it. */
			readonly base64url: boolean;
	  }
	| { readonly kind: "public"; readonly text: string };

const fail = (message: string) => Effect.fail(new InvalidKeyError({ message }));

const importParams = (
	spec: AlgorithmSpec,
): HmacImportParams | RsaHashedImportParams | EcKeyImportParams => {
	switch (spec.family) {
		case "hmac":
			return { name: "HMAC", hash: spec.hash };
		case "rsa-pkcs1":
			return { name: "RSASSA-PKCS1-v1_5", hash: spec.hash };
		case "rsa-pss":
			return { name: "RSA-PSS", hash: spec.hash };
		case "ecdsa":
			return { name: "ECDSA", namedCurve: spec.curve };
	}
};

const rejected = (spec: AlgorithmSpec) => () =>
	new InvalidKeyError({ message: m.jwt_err_key_mismatch({ alg: spec.alg }) });

function secretKey(
	spec: AlgorithmSpec,
	input: KeyInput & { readonly kind: "secret" },
): Effect.Effect<CryptoKey, InvalidKeyError> {
	// Either alphabet and any padding, since secrets are stored both ways.
	const decoded = input.base64url
		? decodeBase64Standard(input.text)
		: undefined;

	if (input.base64url && decoded === undefined) {
		return fail(m.jwt_err_secret_base64());
	}

	const bytes = decoded ?? new TextEncoder().encode(input.text);

	return Effect.tryPromise({
		try: () =>
			crypto.subtle.importKey("raw", bytes, importParams(spec), false, [
				"verify",
			]),
		catch: rejected(spec),
	});
}

const PEM = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/;

function pemKey(
	spec: AlgorithmSpec,
	label: string,
	body: string,
): Effect.Effect<CryptoKey, InvalidKeyError> {
	if (label.includes("PRIVATE KEY")) return fail(m.jwt_err_key_private());

	if (label === "RSA PUBLIC KEY") return fail(m.jwt_err_key_pkcs1());

	if (label === "CERTIFICATE") return fail(m.jwt_err_key_certificate());

	if (label !== "PUBLIC KEY") return fail(m.jwt_err_key_format());

	const decoded = decodeBase64Standard(body);

	if (decoded === undefined) return fail(m.jwt_err_key_pem_body());

	return Effect.tryPromise({
		try: () =>
			crypto.subtle.importKey("spki", decoded, importParams(spec), false, [
				"verify",
			]),
		catch: rejected(spec),
	});
}

/** Reads Base64 in either alphabet, with or without padding and line breaks. */
function decodeBase64Standard(
	text: string,
): Uint8Array<ArrayBuffer> | undefined {
	const url = text
		.replace(/\s+/g, "")
		.replaceAll("+", "-")
		.replaceAll("/", "_");

	const result = decodeBase64Url(url);

	return result.kind === "bytes" ? result.bytes : undefined;
}

// A key that signs, or a shared secret, must never be pasted into a page.
const PRIVATE_FIELDS = ["d", "p", "q", "dp", "dq", "qi", "k"];

function pickJwk(
	value: JsonValue,
	kid: string | undefined,
): Effect.Effect<JsonRecord, InvalidKeyError> {
	if (!isRecord(value)) return fail(m.jwt_err_key_format());

	const list = value.keys;

	if (list === undefined) return Effect.succeed(value);

	if (!Array.isArray(list)) return fail(m.jwt_err_key_format());

	const keys = list.filter(isRecord);

	if (kid !== undefined) {
		const match = keys.find((key) => stringOf(key, "kid") === kid);

		return match
			? Effect.succeed(match)
			: fail(m.jwt_err_key_kid_missing({ kid }));
	}

	const [only, ...others] = keys;

	return only && others.length === 0
		? Effect.succeed(only)
		: fail(m.jwt_err_key_kid_needed({ count: keys.length }));
}

function jwkOf(record: JsonRecord): JsonWebKey {
	return {
		kty: stringOf(record, "kty"),
		crv: stringOf(record, "crv"),
		x: stringOf(record, "x"),
		y: stringOf(record, "y"),
		n: stringOf(record, "n"),
		e: stringOf(record, "e"),
		alg: stringOf(record, "alg"),
		use: stringOf(record, "use"),
	};
}

function jwkKey(
	spec: AlgorithmSpec,
	text: string,
	kid: string | undefined,
): Effect.Effect<CryptoKey, InvalidKeyError> {
	return parseJson(text, messageTemplates(currentLocale())).pipe(
		Effect.mapError(
			() => new InvalidKeyError({ message: m.jwt_err_key_format() }),
		),
		Effect.flatMap((value) => pickJwk(value, kid)),
		Effect.flatMap((record) =>
			PRIVATE_FIELDS.some((field) => record[field] !== undefined)
				? fail(m.jwt_err_key_private())
				: Effect.tryPromise({
						try: () =>
							crypto.subtle.importKey(
								"jwk",
								jwkOf(record),
								importParams(spec),
								false,
								["verify"],
							),
						catch: rejected(spec),
					}),
		),
	);
}

/** Imports the pasted key for `spec`. `kid` is the token's, used to pick from a JWKS. */
export function importKey(
	spec: AlgorithmSpec,
	input: KeyInput,
	kid: string | undefined,
): Effect.Effect<CryptoKey, InvalidKeyError> {
	if (input.kind === "secret") return secretKey(spec, input);

	// Keys copied out of a JSON file or an environment variable carry `\n` as two characters.
	const text = input.text.replaceAll("\\n", "\n").trim();
	const pem = PEM.exec(text);

	if (pem) return pemKey(spec, pem[1] ?? "", pem[2] ?? "");

	return text.startsWith("{")
		? jwkKey(spec, text, kid)
		: fail(m.jwt_err_key_format());
}

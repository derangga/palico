// The token behind "Try an example". It is built here from readable JSON and signed
// with HS256 and `EXAMPLE_SECRET` when the button is pressed, so no token is written
// out in the source. `exp` is in 2100, so the page never opens on a stale example.
// Both the secret and the token are public demo values, not credentials.

import { Effect } from "effect";

import type { JsonValue } from "#/lib/json-converter/types.ts";

import { encodeBase64Url } from "./base64url.ts";

export const EXAMPLE_SECRET = "palico-demo";

const HEADER = { alg: "HS256", typ: "JWT" };

const PAYLOAD = {
	iss: "https://palico.rangga.site",
	sub: "user_42",
	aud: "palico-demo",
	name: "Palico",
	role: "adventurer",
	iat: 1767225600,
	nbf: 1767225600,
	exp: 4102444800,
	jti: "3f2b8c1e",
};

const part = (value: JsonValue): string =>
	encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));

/** The header and payload as written in the example, which is what its signature covers. */
export const EXAMPLE_SIGNING_INPUT = `${part(HEADER)}.${part(PAYLOAD)}`;

/**
 * The signed example. Signing needs Web Crypto, which a page served over plain HTTP
 * does not have. There the example comes unsigned, so it still decodes.
 */
export const buildExampleToken = (): Effect.Effect<string> =>
	Effect.promise(async () => {
		const encode = (text: string) => new TextEncoder().encode(text);

		const key = await crypto.subtle.importKey(
			"raw",
			encode(EXAMPLE_SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		const signature = await crypto.subtle.sign(
			"HMAC",
			key,
			encode(EXAMPLE_SIGNING_INPUT),
		);

		return `${EXAMPLE_SIGNING_INPUT}.${encodeBase64Url(new Uint8Array(signature))}`;
	}).pipe(
		Effect.catchDefect(() => Effect.succeed(`${EXAMPLE_SIGNING_INPUT}.`)),
	);

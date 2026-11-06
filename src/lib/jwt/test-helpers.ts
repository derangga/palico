import { createHmac } from "node:crypto";

import { Cause, Effect, Exit, Option } from "effect";

import type { TokenError } from "./errors.ts";
import type { DecodedToken } from "./token.ts";
import { decodeToken } from "./token.ts";

export const base64url = (data: string | Uint8Array): string =>
	Buffer.from(data).toString("base64url");

/** A token from a header, a payload and a signature, each written as given. */
export const assemble = (
	header: string,
	payload: string,
	signature = "",
): string => `${base64url(header)}.${base64url(payload)}.${signature}`;

/** Decodes a token that should be readable. */
export const decode = (raw: string): DecodedToken =>
	Effect.runSync(decodeToken(raw));

/** The error for a token that should not be readable. */
export const decodeFailure = (raw: string): TokenError => {
	const exit = Effect.runSyncExit(decodeToken(raw));

	const error = Exit.isFailure(exit)
		? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
		: undefined;

	if (!error) throw new Error("should not decode");

	return error;
};

export const pemOf = (spki: ArrayBuffer): string => {
	const body = Buffer.from(spki)
		.toString("base64")
		.match(/.{1,64}/g)
		?.join("\n");

	return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
};

/** Changes one byte of a Base64url signature, so it is still readable but wrong. */
export const tamper = (signature: string): string => {
	const bytes = Buffer.from(signature, "base64url");

	bytes[0] = (bytes[0] ?? 0) ^ 0xff;

	return bytes.toString("base64url");
};

/** An HS256 token from header and payload JSON text, signed with Node's own HMAC. */
export const hs256 = (header: string, payload: string, key: string): string => {
	const input = `${base64url(header)}.${base64url(payload)}`;

	return `${input}.${createHmac("sha256", key).update(input).digest("base64url")}`;
};

/** The jwt.io sample token, rebuilt from its JSON so the source holds no token literal. */
export const jwtIoSample = (): string =>
	hs256(
		'{"alg":"HS256","typ":"JWT"}',
		'{"sub":"1234567890","name":"John Doe","iat":1516239022}',
		"your-256-bit-secret",
	);

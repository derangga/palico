// Reads a token into its parts. Everything here is synchronous and pure, so the
// page decodes on every keystroke and the tests need no setup.

import { Cause, Effect, Exit, Option, Predicate } from "effect";

import { currentLocale } from "#/lib/i18n/state.ts";
import { parseJson, stringifyJson } from "#/lib/json-converter/json.ts";
import { messageTemplates } from "#/lib/json-converter/texts.ts";
import type { JsonValue } from "#/lib/json-converter/types.ts";
import { isRecord, type JsonRecord } from "#/lib/json-converter/value.ts";
import { m } from "#/paraglide/messages.js";

import { decodeBase64Url } from "./base64url.ts";
import {
	type FaultPart,
	InvalidJsonError,
	MalformedTokenError,
	type TokenError,
	TokenTooLargeError,
} from "./errors.ts";
import { stringOf } from "./record.ts";
import { decodeUtf8, showInvalidBytes } from "./utf8.ts";

/** A token longer than this is refused, so a huge paste cannot stall the page per keystroke. */
export const MAX_TOKEN_CHARS = 100_000;

export type Parts = readonly [
	header: string,
	payload: string,
	signature: string,
];

export interface DecodedToken {
	/** The three parts as written, for colouring the token. */
	readonly parts: Parts;
	readonly header: JsonRecord;
	readonly payload: JsonValue;
	/** Pretty-printed JSON with invalid UTF-8 bytes written as `\xHH`. */
	readonly headerText: string;
	readonly payloadText: string;
	/** The raw signature bytes. Empty for an unsecured token. */
	readonly signature: Uint8Array<ArrayBuffer>;
	/** What the signature covers: the header and payload exactly as written, joined by a dot. */
	readonly signingInput: string;
	/** The header's `alg`, when it is a string. */
	readonly alg: string | undefined;
	readonly kid: string | undefined;
}

const AUTHORIZATION = /^authorization\s*:\s*/i;
const BEARER = /^bearer\s+/i;
const WRAPPING_QUOTES = /^(["'`])(.*)\1$/s;
const WHITESPACE = /\s+/g;

/**
 * What a person pastes is not always the bare token: an `Authorization: Bearer`
 * header, quotes around it, or line breaks from an email. This takes those off.
 */
export function tidyToken(raw: string): string {
	return raw
		.trim()
		.replace(WRAPPING_QUOTES, "$2")
		.replace(AUTHORIZATION, "")
		.replace(BEARER, "")
		.replace(WRAPPING_QUOTES, "$2")
		.replace(WHITESPACE, "");
}

/** The three parts of a tidied token, or undefined when it does not have exactly three. */
export function splitParts(token: string): Parts | undefined {
	const [header, payload, signature, ...rest] = token.split(".");

	return header === undefined ||
		payload === undefined ||
		signature === undefined ||
		rest.length > 0
		? undefined
		: [header, payload, signature];
}

/** The name of a part inside a sentence: "header", not "Header". */
export const partName = (part: FaultPart): string => {
	switch (part) {
		case "token":
			return m.jwt_part_token();
		case "header":
			return m.jwt_part_header();
		case "payload":
			return m.jwt_part_payload();
		case "signature":
			return m.jwt_part_signature();
	}
};

// Five parts is a JWE, an encrypted token, which is worth naming. One part has no dots.
const wrongCountMessage = (count: number): string => {
	switch (count) {
		case 1:
			return m.jwt_err_no_dots();
		case 5:
			return m.jwt_err_jwe();
		default:
			return m.jwt_err_parts({ count });
	}
};

const split = (token: string): Effect.Effect<Parts, MalformedTokenError> => {
	const parts = splitParts(token);

	if (parts) return Effect.succeed(parts);

	const message = wrongCountMessage(token.split(".").length);

	return Effect.fail(new MalformedTokenError({ part: "token", message }));
};

const bytesOf = (
	part: FaultPart,
	text: string,
): Effect.Effect<Uint8Array<ArrayBuffer>, MalformedTokenError> => {
	const result = decodeBase64Url(text);

	switch (result.kind) {
		case "bytes":
			return Effect.succeed(result.bytes);
		case "bad-char":
			return Effect.fail(
				new MalformedTokenError({
					part,
					message: m.jwt_err_base64_char({
						part: partName(part),
						char: result.char,
						position: result.index + 1,
					}),
				}),
			);
		case "bad-length":
			return Effect.fail(
				new MalformedTokenError({
					part,
					message: m.jwt_err_base64_length({ part: partName(part) }),
				}),
			);
	}
};

const jsonOf = (
	part: "header" | "payload",
	bytes: Uint8Array,
): Effect.Effect<JsonValue, InvalidJsonError> =>
	parseJson(decodeUtf8(bytes), messageTemplates(currentLocale())).pipe(
		Effect.mapError(
			(error) =>
				new InvalidJsonError({
					part,
					message: m.jwt_err_json({
						part: partName(part),
						reason: showInvalidBytes(error.message),
					}),
				}),
		),
	);

// A bad byte inside `alg` or `kid` is written as \xHH too, so the marker never reaches a message.
const shown = (text: string | undefined): string | undefined =>
	text === undefined ? undefined : showInvalidBytes(text);

const display = (value: JsonValue): string =>
	showInvalidBytes(stringifyJson(value, "2"));

/** Reads a token. Empty input is the caller's to handle: it is not an error. */
export const decodeToken = (
	raw: string,
): Effect.Effect<DecodedToken, TokenError> =>
	Effect.gen(function* () {
		const token = tidyToken(raw);

		if (token.length > MAX_TOKEN_CHARS) {
			return yield* Effect.fail(
				new TokenTooLargeError({
					size: token.length,
					limit: MAX_TOKEN_CHARS,
					message: m.jwt_err_too_large({
						size: Math.ceil(token.length / 1000),
						limit: Math.round(MAX_TOKEN_CHARS / 1000),
					}),
				}),
			);
		}

		const parts = yield* split(token);
		const [headerPart, payloadPart, signaturePart] = parts;

		const headerBytes = yield* bytesOf("header", headerPart);
		const payloadBytes = yield* bytesOf("payload", payloadPart);
		const signature = yield* bytesOf("signature", signaturePart);

		const header = yield* jsonOf("header", headerBytes);
		const payload = yield* jsonOf("payload", payloadBytes);

		if (!isRecord(header)) {
			return yield* Effect.fail(
				new InvalidJsonError({
					part: "header",
					message: m.jwt_err_header_not_object(),
				}),
			);
		}

		return {
			parts,
			header,
			payload,
			headerText: display(header),
			payloadText: display(payload),
			signature,
			signingInput: `${headerPart}.${payloadPart}`,
			alg: shown(stringOf(header, "alg")),
			kid: shown(stringOf(header, "kid")),
		};
	});

export type TokenReading =
	| { readonly kind: "empty" }
	| { readonly kind: "ok"; readonly token: DecodedToken }
	| {
			readonly kind: "error";
			readonly error: TokenError;
			/** The three parts, when there are three, so the page can mark the one at fault. */
			readonly parts: Parts | undefined;
	  };

/**
 * What the page shows for the text in the box. Nothing typed is not an error.
 * A bug inside `decodeToken` is left to throw, since the tests cover every input
 * it can fail on.
 */
export function readToken(raw: string): TokenReading {
	const tidy = tidyToken(raw);

	if (tidy === "") return { kind: "empty" };

	const exit = Effect.runSyncExit(decodeToken(raw));

	if (Exit.isSuccess(exit)) return { kind: "ok", token: exit.value };

	const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

	if (!error) throw Cause.squash(exit.cause);

	return { kind: "error", error, parts: splitParts(tidy) };
}

/** The three parts of what is typed, when it has three. Marks the token on the page. */
export function partsOf(reading: TokenReading): Parts | undefined {
	switch (reading.kind) {
		case "ok":
			return reading.token.parts;
		case "error":
			return reading.parts;
		case "empty":
			return undefined;
	}
}

/** The part an error points at, when it points at one. */
export function faultOf(reading: TokenReading): FaultPart | undefined {
	return reading.kind === "error" &&
		!Predicate.isTagged(reading.error, "TokenTooLargeError")
		? reading.error.part
		: undefined;
}

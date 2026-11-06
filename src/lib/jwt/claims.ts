// Reads the registered claims for people. The payload is untrusted JSON, so every
// claim is read with a guard and an odd value is shown as it is, never thrown on.

import { Predicate } from "effect";

import { stringifyJson } from "#/lib/json-converter/json.ts";
import type { JsonValue } from "#/lib/json-converter/types.ts";
import { isRecord } from "#/lib/json-converter/value.ts";

import { showInvalidBytes } from "./utf8.ts";

export type TimeClaim = "exp" | "nbf" | "iat";

export type TextClaim = "iss" | "sub" | "aud" | "jti";

export type TimeReading =
	| {
			readonly kind: "date";
			readonly claim: TimeClaim;
			/** Milliseconds since 1970, from the claim's seconds. */
			readonly millis: number;
	  }
	| {
			readonly kind: "invalid";
			readonly claim: TimeClaim;
			/** The value as written, so the page can show what was wrong. */
			readonly raw: string;
	  };

export interface TextReading {
	readonly claim: TextClaim;
	/** One entry for a string, one per item for an `aud` list. */
	readonly values: ReadonlyArray<string>;
}

export interface ClaimsReading {
	readonly times: ReadonlyArray<TimeReading>;
	readonly texts: ReadonlyArray<TextReading>;
}

/** Where the present moment sits against the token's `nbf` and `exp`. */
export type Window = "valid" | "expired" | "not-yet" | "none" | "unreadable";

// The largest time a Date can hold. A claim past it has no date to show.
const MAX_DATE_MS = 8.64e15;

const TIME_CLAIMS: ReadonlyArray<TimeClaim> = ["exp", "nbf", "iat"];
const TEXT_CLAIMS: ReadonlyArray<TextClaim> = ["iss", "sub", "aud", "jti"];

const written = (value: JsonValue): string =>
	showInvalidBytes(
		Predicate.isString(value) ? value : stringifyJson(value, "min"),
	);

function readTime(claim: TimeClaim, value: JsonValue): TimeReading {
	// A NumericDate is a number of seconds, and it may have a fraction.
	const millis = Predicate.isNumber(value) ? value * 1000 : Number.NaN;

	return Number.isFinite(millis) && Math.abs(millis) <= MAX_DATE_MS
		? { kind: "date", claim, millis }
		: { kind: "invalid", claim, raw: written(value) };
}

function readText(claim: TextClaim, value: JsonValue): TextReading {
	return {
		claim,
		values: Array.isArray(value) ? value.map(written) : [written(value)],
	};
}

/**
 * The registered claims of a payload, in a fixed order. Returns undefined when
 * the payload is valid JSON but not an object, since it then has no claims.
 */
export function readClaims(payload: JsonValue): ClaimsReading | undefined {
	if (!isRecord(payload)) return undefined;

	const times: Array<TimeReading> = [];
	const texts: Array<TextReading> = [];

	for (const claim of TIME_CLAIMS) {
		const value = payload[claim];

		if (value !== undefined) times.push(readTime(claim, value));
	}

	for (const claim of TEXT_CLAIMS) {
		const value = payload[claim];

		if (value !== undefined) texts.push(readText(claim, value));
	}

	return { times, texts };
}

const millisOf = (
	times: ReadonlyArray<TimeReading>,
	claim: TimeClaim,
): number | undefined => {
	const reading = times.find((time) => time.claim === claim);

	return reading?.kind === "date" ? reading.millis : undefined;
};

/**
 * Where `now` (milliseconds) falls against `nbf` and `exp`. RFC 7519 makes `exp`
 * the first moment the token must not be accepted, so `now === exp` is expired.
 * An `nbf` is the first moment it may be accepted. There is no clock leeway.
 */
export function windowAt(
	times: ReadonlyArray<TimeReading>,
	now: number,
): Window {
	const notBefore = millisOf(times, "nbf");
	const expires = millisOf(times, "exp");

	if (notBefore !== undefined && now < notBefore) return "not-yet";

	if (expires !== undefined && now >= expires) return "expired";

	// A time limit that is there but cannot be read is not "no limit". Saying so would
	// call a token unlimited when it only has an expiry the page does not understand.
	if (times.some((time) => time.kind === "invalid" && time.claim !== "iat")) {
		return "unreadable";
	}

	return notBefore === undefined && expires === undefined ? "none" : "valid";
}

/** The moments the page's clock has to notice, so "expired" appears the second it is true. */
export const boundariesOf = (
	times: ReadonlyArray<TimeReading>,
): ReadonlyArray<number> =>
	times.flatMap((time) =>
		time.kind === "date" && time.claim !== "iat" ? [time.millis] : [],
	);

import { Schema } from "effect";

/** The parts of a token an error can point at. `token` means the whole thing. */
export const FaultPart = Schema.Literals([
	"token",
	"header",
	"payload",
	"signature",
]);

export type FaultPart = typeof FaultPart.Type;

// The text is not three Base64url parts: the wrong number of dots, or a part
// with a character that Base64url does not allow.
export class MalformedTokenError extends Schema.TaggedError<MalformedTokenError>()(
	"MalformedTokenError",
	{
		part: FaultPart,
		message: Schema.String,
	},
) {}

// The header or the payload decoded to bytes but is not JSON. `part` says which.
export class InvalidJsonError extends Schema.TaggedError<InvalidJsonError>()(
	"InvalidJsonError",
	{
		part: Schema.Literals(["header", "payload"]),
		message: Schema.String,
	},
) {}

// The token is too long to read on each keystroke.
export class TokenTooLargeError extends Schema.TaggedError<TokenTooLargeError>()(
	"TokenTooLargeError",
	{
		size: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

// The header names an algorithm that Web Crypto cannot check here, or none at all.
export class UnsupportedAlgorithmError extends Schema.TaggedError<UnsupportedAlgorithmError>()(
	"UnsupportedAlgorithmError",
	{
		alg: Schema.String,
		message: Schema.String,
	},
) {}

// The secret or public key cannot be used for this token: it is not a key, it is a
// private key, or its type does not fit the algorithm.
export class InvalidKeyError extends Schema.TaggedError<InvalidKeyError>()(
	"InvalidKeyError",
	{
		message: Schema.String,
	},
) {}

/** What stops a token from being read. These replace the decoded cards. */
export type TokenError =
	| MalformedTokenError
	| InvalidJsonError
	| TokenTooLargeError;

/** What stops a signature from being checked. These show inside the verify section. */
export type VerifyError = UnsupportedAlgorithmError | InvalidKeyError;

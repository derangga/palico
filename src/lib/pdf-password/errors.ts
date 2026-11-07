import { Schema } from "effect";

// Failures of the PDF password tool. Each is its own tagged error so the page can
// show the right thing in the right place: a red field, an inline line, a toast.
// Engine failures (PdfEngineLoadError) live in src/lib/qpdf/errors.ts.

// The open password is wrong. The field turns red and keeps focus; there is no
// limit on tries.
export class WrongPasswordError extends Schema.TaggedError<WrongPasswordError>()(
	"WrongPasswordError",
	{
		message: Schema.String,
	},
) {}

// Locked with a certificate (public-key security) or a handler we do not know, so
// no password would open it.
export class UnsupportedEncryptionError extends Schema.TaggedError<UnsupportedEncryptionError>()(
	"UnsupportedEncryptionError",
	{
		message: Schema.String,
	},
) {}

// The two Protect fields differ. Caught on the page before any work starts.
export class PasswordMismatchError extends Schema.TaggedError<PasswordMismatchError>()(
	"PasswordMismatchError",
	{
		message: Schema.String,
	},
) {}

// Protect needs a password. Caught on the page before any work starts.
export class EmptyPasswordError extends Schema.TaggedError<EmptyPasswordError>()(
	"EmptyPasswordError",
	{
		message: Schema.String,
	},
) {}

// Unlock was run on a file that has no password.
export class NotEncryptedError extends Schema.TaggedError<NotEncryptedError>()(
	"NotEncryptedError",
	{
		message: Schema.String,
	},
) {}

// Protect was run on a file that already needs a password to open.
export class AlreadyEncryptedError extends Schema.TaggedError<AlreadyEncryptedError>()(
	"AlreadyEncryptedError",
	{
		message: Schema.String,
	},
) {}

// The output did not pass the re-read, so it is not offered for download.
export class OutputVerificationError extends Schema.TaggedError<OutputVerificationError>()(
	"OutputVerificationError",
	{
		message: Schema.String,
	},
) {}

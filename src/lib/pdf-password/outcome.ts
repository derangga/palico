// What the page does with a finished job. The jobs fail with eleven tagged errors;
// the page needs five answers, each with its own place on screen:
//
//   done    the file is ready (download it)
//   field   a password field is wrong: turn it red, focus it, keep the form
//   blocked a condition retrying will not fix: say so beside the file
//   engine  the qpdf engine is missing or would not start: show the engine card
//           with Try again
//   failed  anything else: a toast
//
// Every error is handled here by tag, so a new error type is a type error until it
// has a place on screen. The result never fails, not even on a defect, so the page
// has one value to read and can never be left waiting.

import { Effect } from "effect";

import type {
	InvalidPdfError,
	PdfTooLargeError,
	PdfWorkerError,
} from "#/lib/file/errors.ts";
import type { PdfEngineLoadError } from "#/lib/qpdf/errors.ts";
import { m } from "#/paraglide/messages.js";

import type {
	AlreadyEncryptedError,
	EmptyPasswordError,
	NotEncryptedError,
	OutputVerificationError,
	PasswordMismatchError,
	UnsupportedEncryptionError,
	WrongPasswordError,
} from "./errors.ts";
import { protectPdf, unlockPdf } from "./pdf-password.ts";
import type { PdfCrypt } from "./service.ts";
import type { ProtectForm } from "./shapes.ts";

export type PasswordField = "password" | "confirm";

export type JobOutcome =
	| {
			readonly kind: "done";
			readonly blob: Blob;
			readonly name: string;
			readonly pageCount: number;
	  }
	| {
			readonly kind: "field";
			readonly field: PasswordField;
			readonly message: string;
	  }
	| { readonly kind: "blocked"; readonly message: string }
	| { readonly kind: "engine"; readonly message: string }
	| { readonly kind: "failed"; readonly message: string };

// Every error a job can end with.
type JobError =
	| EmptyPasswordError
	| PasswordMismatchError
	| WrongPasswordError
	| UnsupportedEncryptionError
	| NotEncryptedError
	| AlreadyEncryptedError
	| OutputVerificationError
	| PdfEngineLoadError
	| InvalidPdfError
	| PdfTooLargeError
	| PdfWorkerError;

interface JobSuccess {
	readonly blob: Blob;
	readonly name: string;
	readonly pageCount: number;
}

interface Worded {
	readonly message: string;
}

const field =
	(which: PasswordField) =>
	(error: Worded): Effect.Effect<JobOutcome> =>
		Effect.succeed({ kind: "field", field: which, message: error.message });

const blocked = (error: Worded): Effect.Effect<JobOutcome> =>
	Effect.succeed({ kind: "blocked", message: error.message });

const engine = (error: Worded): Effect.Effect<JobOutcome> =>
	Effect.succeed({ kind: "engine", message: error.message });

const failed = (error: Worded): Effect.Effect<JobOutcome> =>
	Effect.succeed({ kind: "failed", message: error.message });

const toOutcome = <R>(
	job: Effect.Effect<JobSuccess, JobError, R>,
): Effect.Effect<JobOutcome, never, R> =>
	job.pipe(
		Effect.map((result): JobOutcome => ({ kind: "done", ...result })),
		Effect.catchTags({
			EmptyPasswordError: field("password"),
			PasswordMismatchError: field("confirm"),
			WrongPasswordError: field("password"),
			UnsupportedEncryptionError: blocked,
			NotEncryptedError: blocked,
			AlreadyEncryptedError: blocked,
			PdfEngineLoadError: engine,
			OutputVerificationError: failed,
			InvalidPdfError: failed,
			PdfTooLargeError: failed,
			PdfWorkerError: failed,
		}),
		// A defect (a bug, or something thrown that no error type describes) must not
		// reject the promise the page awaits. It becomes a toast like any other failure.
		Effect.catchCause(() => failed({ message: m.pdfpw_error_unexpected() })),
	);

export const runProtect = (
	file: File,
	form: ProtectForm,
): Effect.Effect<JobOutcome, never, PdfCrypt> =>
	toOutcome(protectPdf(file, form));

export const runUnlock = (
	file: File,
	password: string,
): Effect.Effect<JobOutcome, never, PdfCrypt> =>
	toOutcome(unlockPdf(file, password));

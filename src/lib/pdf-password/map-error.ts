// Turns the worker's failure reason into the tool's tagged error, worded in the
// active language. Pure apart from reading the language, and tested for every reason.

import { Schema } from "effect";

import { InvalidPdfError, PdfWorkerError } from "#/lib/file/errors.ts";
import { PdfEngineLoadError } from "#/lib/qpdf/errors.ts";
import { m } from "#/paraglide/messages.js";

import {
	AlreadyEncryptedError,
	NotEncryptedError,
	OutputVerificationError,
	UnsupportedEncryptionError,
	WrongPasswordError,
} from "./errors.ts";
import { CryptFailReason } from "./shapes.ts";

export type CryptError =
	| WrongPasswordError
	| UnsupportedEncryptionError
	| NotEncryptedError
	| AlreadyEncryptedError
	| OutputVerificationError
	| PdfEngineLoadError
	| InvalidPdfError
	| PdfWorkerError;

const isFailReason = Schema.is(CryptFailReason);

// `reason` arrives as a string over the worker channel, so an unknown one falls
// through to a generic worker error instead of failing silently.
export const toCryptError = (
	fileName: string,
	reason: string,
	detail: string | undefined,
): CryptError => {
	const known = isFailReason(reason) ? reason : "worker";

	switch (known) {
		case "wrong-password":
			return new WrongPasswordError({ message: m.pdfpw_error_wrong() });
		case "unsupported-encryption":
			return new UnsupportedEncryptionError({
				message: m.pdfpw_error_unsupported(),
			});
		case "not-encrypted":
			return new NotEncryptedError({ message: m.pdfpw_error_not_encrypted() });
		case "source-encrypted":
			return new AlreadyEncryptedError({
				message: m.pdfpw_error_already_encrypted(),
			});
		case "verify-failed":
			return new OutputVerificationError({
				message: m.pdfpw_error_verify(),
			});
		case "invalid":
			return new InvalidPdfError({ fileName, message: m.error_pdf_invalid() });
		case "engine-load":
			return new PdfEngineLoadError({
				stage: "starting",
				message: m.error_qpdf_start(),
			});
		default:
			return new PdfWorkerError({
				fileName,
				message: detail ?? m.error_pdf_worker_failed(),
			});
	}
};

// Protect and Unlock as Effects. The graph:
//
//   protect(file, form)
//     validateProtect(form)         E: EmptyPasswordError | PasswordMismatchError
//     run(file, job)
//       check the size              E: PdfTooLargeError
//       read the file               E: InvalidPdfError
//       PdfCrypt.run(job)           R: PdfCrypt   E: CryptError
//       wrap the bytes in a Blob
//   unlock(file, password)
//     run(file, job)                the same, with no form to check
//
// Nothing here retries. Every failure is a value the page shows, and the person
// decides what to do (retype the password, switch mode, try again).

import { Effect } from "effect";

import { InvalidPdfError, PdfTooLargeError } from "#/lib/file/errors.ts";
import { MAX_PDF_BYTES } from "#/lib/file/pdf-types.ts";
import { m } from "#/paraglide/messages.js";

import { validateProtect } from "./protect-form.ts";
import { PdfCrypt } from "./service.ts";
import { type CryptJob, outputName, type ProtectForm } from "./shapes.ts";

const MB = 1024 * 1024;

const checkSize = (file: File): Effect.Effect<void, PdfTooLargeError> =>
	file.size > MAX_PDF_BYTES
		? Effect.fail(
				new PdfTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_PDF_BYTES,
					message: m.error_pdf_too_large({
						name: file.name,
						limit: Math.round(MAX_PDF_BYTES / MB),
					}),
				}),
			)
		: Effect.void;

const run = Effect.fn("PdfPassword.run")(function* (file: File, job: CryptJob) {
	yield* checkSize(file);

	const buffer = yield* Effect.tryPromise({
		try: () => file.arrayBuffer(),
		catch: () =>
			new InvalidPdfError({
				fileName: file.name,
				message: m.error_read_file(),
			}),
	});

	const crypt = yield* PdfCrypt;
	const result = yield* crypt.run({ fileName: file.name, buffer, job });

	return {
		blob: new Blob([result.bytes], { type: "application/pdf" }),
		name: outputName(file.name, job.mode),
		pageCount: result.pageCount,
	};
});

export const protectPdf = Effect.fn("PdfPassword.protect")(function* (
	file: File,
	form: ProtectForm,
) {
	const job = yield* validateProtect(form);

	return yield* run(file, job);
});

export const unlockPdf = (file: File, password: string) =>
	run(file, { mode: "unlock", password });

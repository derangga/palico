// Reads qpdf's exit codes and text and decides what happened. Pure, and tested
// against the text a real qpdf 12.2 writes (see classify.test.ts). Matching is on
// qpdf's English messages, which it does not translate; if a future qpdf words one
// differently the job falls through to "invalid", never to a wrong success.

import { QPDF_OK_EXITS, type QpdfStepResult } from "#/lib/qpdf/types.ts";

import type { CryptFailReason } from "./shapes.ts";

type Failure = {
	readonly ok: false;
	readonly reason: CryptFailReason;
	readonly detail?: string;
};

export type Classified =
	| { readonly ok: true; readonly pageCount: number }
	| Failure;

const text = (lines: ReadonlyArray<string>) => lines.join("\n").toLowerCase();

const failed = (step: QpdfStepResult) => !QPDF_OK_EXITS.includes(step.exitCode);

const lastLine = (step: QpdfStepResult): string | undefined =>
	step.stderr.filter((line) => line.trim() !== "").at(-1);

// qpdf says "invalid password" for a missing or wrong one, and "unsupported
// encryption filter" for certificate security and for a handler it does not know.
const NEEDS_PASSWORD = /invalid password/;
const UNSUPPORTED = /unsupported encryption|adobe\.pubsec/;

const failure = (reason: CryptFailReason, step?: QpdfStepResult): Failure => {
	const detail = step ? lastLine(step) : undefined;

	return detail === undefined
		? { ok: false, reason }
		: { ok: false, reason, detail };
};

// Why a step that exited badly did so, when all we know is its text.
const reasonOf = (step: QpdfStepResult): CryptFailReason => {
	const said = text(step.stderr);

	if (NEEDS_PASSWORD.test(said)) return "wrong-password";

	if (UNSUPPORTED.test(said)) return "unsupported-encryption";

	return "invalid";
};

const pagesOf = (step: QpdfStepResult | undefined): number | undefined => {
	const count = Number.parseInt(step?.stdout[0] ?? "", 10);

	return Number.isInteger(count) && count > 0 ? count : undefined;
};

const NOT_ENCRYPTED = "file is not encrypted";

const saysNotEncrypted = (step: QpdfStepResult | undefined) =>
	step !== undefined && text(step.stdout).includes(NOT_ENCRYPTED);

// Steps are the four of `unlockSteps`. `hasOutput` is whether /output.pdf exists.
export const classifyUnlock = (
	steps: ReadonlyArray<QpdfStepResult>,
	hasOutput: boolean,
): Classified => {
	const [look, count, decrypt, after] = steps;

	if (look === undefined) return failure("worker");

	if (failed(look)) return failure(reasonOf(look), look);

	if (saysNotEncrypted(look)) return failure("not-encrypted");

	if (count === undefined || failed(count)) return failure("invalid", count);

	if (decrypt === undefined || failed(decrypt)) {
		return failure(decrypt ? reasonOf(decrypt) : "worker", decrypt);
	}

	const pageCount = pagesOf(count);

	if (!hasOutput || pageCount === undefined) return failure("invalid");

	// The output must read back as not encrypted.
	if (after === undefined || failed(after) || !saysNotEncrypted(after)) {
		return failure("verify-failed", after);
	}

	return { ok: true, pageCount };
};

// Steps are the four of `protectSteps`.
export const classifyProtect = (
	steps: ReadonlyArray<QpdfStepResult>,
	hasOutput: boolean,
): Classified => {
	const [look, count, encrypt, after] = steps;

	if (look === undefined) return failure("worker");

	if (failed(look)) {
		// The source asks for a password. For Protect that is not "wrong password"
		// (that is the Unlock field), it is "this file is already locked".
		const reason = reasonOf(look);

		return failure(
			reason === "wrong-password" ? "source-encrypted" : reason,
			look,
		);
	}

	if (count === undefined || failed(count)) return failure("invalid", count);

	if (encrypt === undefined || failed(encrypt)) {
		return failure(encrypt ? reasonOf(encrypt) : "worker", encrypt);
	}

	const pageCount = pagesOf(count);

	if (!hasOutput || pageCount === undefined) return failure("invalid");

	// Revision 6 with AES-256 ("AESv3" in qpdf's words), opened with the new password.
	const shown = after === undefined ? "" : text(after.stdout);

	if (
		after === undefined ||
		failed(after) ||
		!shown.includes("r = 6") ||
		!shown.includes("aesv3")
	) {
		return failure("verify-failed", after);
	}

	return { ok: true, pageCount };
};

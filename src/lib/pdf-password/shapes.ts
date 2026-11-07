import { Schema } from "effect";

// Shapes for the PDF password tool (/pdf-password). Protect adds a password to a
// PDF and Unlock removes it. The work is qpdf in src/workers/pdf-crypt.worker.ts.

export const PasswordMode = Schema.Literals(["protect", "unlock"]);

export type PasswordMode = Schema.Schema.Type<typeof PasswordMode>;

// What a person who opens the file with the open password may still do. Only
// meaningful with an owner password (see `normalizeProtect`).
export const Permissions = Schema.Struct({
	print: Schema.Boolean,
	copy: Schema.Boolean,
	edit: Schema.Boolean,
});

export type Permissions = Schema.Schema.Type<typeof Permissions>;

export const ALL_ALLOWED: Permissions = { print: true, copy: true, edit: true };

export const EncryptionStatus = Schema.Literals(["encrypted", "plain"]);

export type EncryptionStatus = Schema.Schema.Type<typeof EncryptionStatus>;

// What the form holds for Protect, as typed.
export interface ProtectForm {
	readonly password: string;
	readonly confirm: string;
	readonly ownerPassword: string;
	readonly permissions: Permissions;
}

// What a Protect job needs once the form is checked.
export const ProtectJob = Schema.Struct({
	mode: Schema.Literal("protect"),
	userPassword: Schema.String,
	ownerPassword: Schema.String,
	permissions: Permissions,
});

export type ProtectJob = Schema.Schema.Type<typeof ProtectJob>;

export const UnlockJob = Schema.Struct({
	mode: Schema.Literal("unlock"),
	// May be empty: a file with only an owner password opens with no password.
	password: Schema.String,
});

export type UnlockJob = Schema.Schema.Type<typeof UnlockJob>;

export const CryptJob = Schema.Union([ProtectJob, UnlockJob]);

export type CryptJob = Schema.Schema.Type<typeof CryptJob>;

// Why a job failed, as the worker reports it. The page words each one in the active
// language (see map-error.ts); the worker has no active language.
export const CryptFailReason = Schema.Literals([
	"wrong-password",
	"unsupported-encryption",
	// Unlock was asked of a file that has no password.
	"not-encrypted",
	// Protect was asked of a file that already needs a password to open.
	"source-encrypted",
	// qpdf could not read the file.
	"invalid",
	// qpdf wrote a file, but re-reading it did not give what was promised.
	"verify-failed",
	// The wasm could not be loaded.
	"engine-load",
	"worker",
]);

export type CryptFailReason = Schema.Schema.Type<typeof CryptFailReason>;

export type CryptOutcome =
	| {
			readonly ok: true;
			readonly bytes: Uint8Array<ArrayBuffer>;
			readonly pageCount: number;
	  }
	| {
			readonly ok: false;
			readonly reason: CryptFailReason;
			readonly detail?: string;
	  };

// --- Worker messages (page <-> src/workers/pdf-crypt.worker.ts) -------------------
// One request carries everything a job needs, passwords included, so a password
// crosses into the worker in one message and the worker is terminated when the job
// ends.

export const CryptRequest = Schema.Struct({
	type: Schema.Literal("crypt"),
	id: Schema.String,
	wasmUrl: Schema.String,
	buffer: Schema.instanceOf(ArrayBuffer),
	job: CryptJob,
});

export type CryptRequest = Schema.Schema.Type<typeof CryptRequest>;

export const CryptDone = Schema.Struct({
	type: Schema.Literal("crypt-done"),
	id: Schema.String,
	bytes: Schema.instanceOf(ArrayBuffer),
	pageCount: Schema.Number,
});

export type CryptDone = Schema.Schema.Type<typeof CryptDone>;

// A crypt job can fail for more reasons than a generic qpdf run, so it has its own
// failure message. It carries the same `type` tag as the generic one.
export const CryptFailure = Schema.Struct({
	type: Schema.Literal("error"),
	id: Schema.String,
	reason: CryptFailReason,
	detail: Schema.optional(Schema.String),
});

export type CryptFailure = Schema.Schema.Type<typeof CryptFailure>;

// --- Output name ----------------------------------------------------------------

const SUFFIX: Record<PasswordMode, string> = {
	protect: "_protected",
	unlock: "_unlocked",
};

// "report.pdf" becomes "report_protected.pdf" or "report_unlocked.pdf".
export const outputName = (fileName: string, mode: PasswordMode): string => {
	const base = fileName.replace(/\.pdf$/i, "");

	return `${base === "" ? "document" : base}${SUFFIX[mode]}.pdf`;
};

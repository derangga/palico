// "Is this PDF locked?", answered on the page without the qpdf engine, so a person
// who drops the wrong kind of file on a page can be pointed at the right one before
// anything is downloaded.
//
// A locked PDF names its encryption dictionary in the trailer: `/Encrypt 12 0 R`,
// or `/Encrypt << ... >>` in a classic trailer. The trailer is uncompressed, and
// everything else in a locked file is ciphertext, so the key only shows up as the
// real thing. We look for it anywhere in the file, in slices, because where the
// trailer sits depends on how the file was saved (linearized, incremental, with a
// cross-reference stream). A hit only decides whether to show a notice. qpdf makes
// the real decision when the job runs.

import { Effect } from "effect";

import type { EncryptionStatus, PasswordMode } from "./shapes.ts";

const ENCRYPT_KEY = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/;

// Slice size, and how far each slice reaches back into the one before, so a key
// that straddles a boundary is still found.
const SLICE_BYTES = 1024 * 1024;
const OVERLAP_BYTES = 64;

// One slice of a file, read as Latin-1 so every byte is one character.
const looksLocked = (bytes: Uint8Array): boolean =>
	ENCRYPT_KEY.test(new TextDecoder("latin1").decode(bytes));

// Reads the file one slice at a time, so a 50 MB PDF is never in memory twice.
export const detectEncryption = (file: Blob): Effect.Effect<EncryptionStatus> =>
	Effect.gen(function* () {
		for (let start = 0; start < file.size; start += SLICE_BYTES) {
			const from = Math.max(0, start - OVERLAP_BYTES);

			const buffer = yield* Effect.promise(() =>
				file.slice(from, start + SLICE_BYTES).arrayBuffer(),
			);

			if (looksLocked(new Uint8Array(buffer))) return "encrypted";
		}

		return "plain";
	}).pipe(
		// A file we cannot read is for the job to report; the guess falls back.
		Effect.catchDefect(() => Effect.succeed<EncryptionStatus>("plain")),
	);

// The mode a file most likely wants: a file with a password wants Unlock, any other
// wants Protect. Only a guess: a locked file may merely limit printing and copying, in
// which case Protect is right. So the page uses it to pick a starting mode and to
// offer a switch, and never to refuse.
export const suggestMode = (status: EncryptionStatus): PasswordMode =>
	status === "encrypted" ? "unlock" : "protect";

// The mode to offer a switch to, when the file looks like it belongs in the other one.
export const modeHint = (
	mode: PasswordMode,
	status: EncryptionStatus,
): PasswordMode | undefined => {
	const suggested = suggestMode(status);

	return suggested === mode ? undefined : suggested;
};

// The mode once a file has been read. An untouched switch follows the file; one the
// person has used (or a link has set) stays where it is.
export const modeAfterDetect = (
	current: PasswordMode,
	chosen: boolean,
	status: EncryptionStatus,
): PasswordMode => (chosen ? current : suggestMode(status));

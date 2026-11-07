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

// What a page says about the file that was dropped on it, when the file looks like it
// belongs on the other page.
//   "locked"  a locked file on Protect. It may need a password to open (Unlock first)
//             or only limit printing and copying (Protect replaces the limits).
//   "plain"   a file with no password on Unlock: nothing to unlock.
export type ModeNotice = "locked" | "plain";

export const modeNotice = (
	mode: PasswordMode,
	status: EncryptionStatus,
): ModeNotice | undefined => {
	if (mode === "protect" && status === "encrypted") return "locked";

	if (mode === "unlock" && status === "plain") return "plain";

	return undefined;
};

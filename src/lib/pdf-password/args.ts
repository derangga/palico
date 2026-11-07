// qpdf command lines for Protect and Unlock. Pure: no wasm, no worker.
//
// Passwords go in as `--password=...` and `--user-password=...` (qpdf 11.7 and
// later) rather than as bare positional arguments. The positional form
// `--encrypt user owner 256 --` breaks on a password that starts with `-`, because
// qpdf reads it as an option. The flag form takes any text.
//
// A password is a credential. It is placed in these arrays only inside the worker,
// is never logged, and never leaves this process.

import type { QpdfStep } from "#/lib/qpdf/types.ts";

import type { Permissions, ProtectJob } from "./shapes.ts";

// Paths inside qpdf's in-memory file system.
export const INPUT_PATH = "/input.pdf";
export const OUTPUT_PATH = "/output.pdf";

const flag = (allowed: boolean) => (allowed ? "y" : "n");

// Print, copy and edit as qpdf's 256-bit options. `--accessibility=y` stays on
// always: screen readers may read the text out even when copying is off, which is
// how Acrobat treats it and what accessibility law expects.
export const permissionArgs = (permissions: Permissions): string[] => [
	`--print=${permissions.print ? "full" : "none"}`,
	`--extract=${flag(permissions.copy)}`,
	`--modify=${permissions.edit ? "all" : "none"}`,
	"--accessibility=y",
];

// The encrypt command. 256-bit means AES-256 (revision 6).
export const buildProtectArgs = (job: ProtectJob): string[] => [
	"--encrypt",
	`--user-password=${job.userPassword}`,
	`--owner-password=${job.ownerPassword}`,
	"--bits=256",
	...permissionArgs(job.permissions),
	"--",
	INPUT_PATH,
	OUTPUT_PATH,
];

export const buildUnlockArgs = (password: string): string[] => [
	"--decrypt",
	`--password=${password}`,
	INPUT_PATH,
	OUTPUT_PATH,
];

// The commands one Protect job runs, in order. A failing command ends the run.
//   0  look at the source: is it already locked?
//   1  count its pages, for the re-read to compare against
//   2  encrypt
//   3  read the output's encryption back with the new password
export const protectSteps = (job: ProtectJob): ReadonlyArray<QpdfStep> => [
	{ args: ["--show-encryption", INPUT_PATH] },
	{ args: ["--show-npages", INPUT_PATH] },
	{ args: buildProtectArgs(job) },
	{
		args: ["--show-encryption", `--password=${job.userPassword}`, OUTPUT_PATH],
	},
];

//   0  does the source need a password, and is it the right one?
//   1  count its pages
//   2  decrypt
//   3  read the output's encryption back: it must say "not encrypted"
export const unlockSteps = (password: string): ReadonlyArray<QpdfStep> => [
	{ args: ["--show-encryption", `--password=${password}`, INPUT_PATH] },
	{ args: ["--show-npages", `--password=${password}`, INPUT_PATH] },
	{ args: buildUnlockArgs(password) },
	{ args: ["--show-encryption", OUTPUT_PATH] },
];

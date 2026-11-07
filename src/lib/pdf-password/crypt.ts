// One Protect or Unlock job, start to finish, with its two collaborators passed in:
// something that runs qpdf commands and something that re-opens the output with
// pdf.js. The worker passes the real ones; tests pass the real qpdf wasm and a fake
// re-open. Returns a value, never throws, so the worker has one thing to post.

import { scrub } from "#/lib/qpdf/scrub.ts";
import type { QpdfInput, QpdfRunResult } from "#/lib/qpdf/types.ts";

import { INPUT_PATH, OUTPUT_PATH, protectSteps, unlockSteps } from "./args.ts";
import {
	type Classified,
	classifyProtect,
	classifyUnlock,
} from "./classify.ts";
import type { CryptJob, CryptOutcome } from "./shapes.ts";

export interface VerifyRequest {
	readonly bytes: Uint8Array<ArrayBuffer>;
	// The password to open the output with. Unlock opens it with none.
	readonly password: string | undefined;
	// The page count qpdf read from the source.
	readonly expectPages: number;
	// Protect: opening without the password must be refused.
	readonly expectPasswordRequired: boolean;
}

export interface CryptDeps {
	readonly runQpdf: (params: {
		readonly inputs: ReadonlyArray<QpdfInput>;
		readonly steps: ReadonlyArray<{ readonly args: ReadonlyArray<string> }>;
		readonly outputs: ReadonlyArray<string>;
	}) => Promise<QpdfRunResult>;
	// True when the re-open passed.
	readonly verify: (request: VerifyRequest) => Promise<boolean>;
}

// What in a job must never leave the worker in text.
export const secretsOf = (job: CryptJob): ReadonlyArray<string> =>
	job.mode === "protect"
		? [job.userPassword, job.ownerPassword]
		: [job.password];

const stepsOf = (job: CryptJob) =>
	job.mode === "protect" ? protectSteps(job) : unlockSteps(job.password);

const classify = (
	job: CryptJob,
	run: QpdfRunResult,
	hasOutput: boolean,
): Classified =>
	job.mode === "protect"
		? classifyProtect(run.steps, hasOutput)
		: classifyUnlock(run.steps, hasOutput);

export const executeCrypt = async (
	job: CryptJob,
	source: Uint8Array,
	deps: CryptDeps,
): Promise<CryptOutcome> => {
	const run = await deps.runQpdf({
		inputs: [{ path: INPUT_PATH, bytes: source }],
		steps: stepsOf(job),
		outputs: [OUTPUT_PATH],
	});

	const output = run.outputs.find((file) => file.path === OUTPUT_PATH);
	const verdict = classify(job, run, output !== undefined);

	if (!verdict.ok) {
		return {
			ok: false,
			reason: verdict.reason,
			detail: scrub(verdict.detail, secretsOf(job)),
		};
	}

	if (output === undefined) return { ok: false, reason: "invalid" };

	// Re-open the output the way a reader would, before offering it.
	const reopened = await deps.verify({
		bytes: output.bytes,
		password: job.mode === "protect" ? job.userPassword : undefined,
		expectPages: verdict.pageCount,
		expectPasswordRequired: job.mode === "protect",
	});

	return reopened
		? { ok: true, bytes: output.bytes, pageCount: verdict.pageCount }
		: { ok: false, reason: "verify-failed" };
};

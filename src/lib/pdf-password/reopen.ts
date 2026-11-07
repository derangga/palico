// Re-opens a finished PDF with pdf.js, the way a reader would, to confirm it is what
// the job promised. Runs inside src/workers/pdf-crypt.worker.ts: pdf.js parses in its
// own nested worker, so none of this touches the page thread.
//
//   Protect: opens with the new password and has the same page count, and opening
//            without a password is refused.
//   Unlock:  opens with no password and has the same page count.

import { getDocument } from "pdfjs-dist";

import {
	NoopFilterFactory,
	OffscreenCanvasFactory,
} from "#/lib/file/pdf-headless.ts";

import type { VerifyRequest } from "./crypt.ts";

type Opened =
	| { readonly kind: "opened"; readonly pages: number }
	| { readonly kind: "needs-password" }
	| { readonly kind: "failed" };

// pdf.js may take ownership of the bytes it is given, so each open gets a copy.
const open = async (
	bytes: Uint8Array<ArrayBuffer>,
	password: string | undefined,
): Promise<Opened> => {
	const task = getDocument({
		data: bytes.slice(),
		password,
		CanvasFactory: OffscreenCanvasFactory,
		FilterFactory: NoopFilterFactory,
	});

	try {
		const doc = await task.promise;

		return { kind: "opened", pages: doc.numPages };
	} catch (cause) {
		return cause instanceof Error && cause.name === "PasswordException"
			? { kind: "needs-password" }
			: { kind: "failed" };
	} finally {
		await task.destroy().catch(() => undefined);
	}
};

export const reopenOutput = async (
	request: VerifyRequest,
): Promise<boolean> => {
	const withPassword = await open(request.bytes, request.password);

	if (
		withPassword.kind !== "opened" ||
		withPassword.pages !== request.expectPages
	) {
		return false;
	}

	if (!request.expectPasswordRequired) return true;

	const without = await open(request.bytes, undefined);

	return without.kind === "needs-password";
};

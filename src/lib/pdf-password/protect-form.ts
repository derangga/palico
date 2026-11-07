// Checks the Protect form before any work starts, and turns it into a job. Pure.

import { Effect } from "effect";

import { m } from "#/paraglide/messages.js";

import { EmptyPasswordError, PasswordMismatchError } from "./errors.ts";
import { ALL_ALLOWED, type ProtectForm, type ProtectJob } from "./shapes.ts";

export type ProtectFormIssue = "empty" | "mismatch";

// What is wrong with the form, if anything. `confirm` only counts once the person
// has typed something in it, so the mismatch line does not shout while they are
// still on the first field.
export const protectFormIssue = (
	form: Pick<ProtectForm, "password" | "confirm">,
): ProtectFormIssue | undefined => {
	if (form.password === "") return "empty";

	if (form.confirm !== form.password) return "mismatch";

	return undefined;
};

// The job for a checked form.
//
// With no owner password the open password is also the owner password, and every
// permission stays on. A permission limit only holds against someone who cannot
// become the owner, and anyone who knows the open password could. The form
// disables the three switches until an owner password exists, and this is the
// backstop for a caller that sends them anyway.
export const normalizeProtect = (form: ProtectForm): ProtectJob => {
	const hasOwner = form.ownerPassword !== "";

	return {
		mode: "protect",
		userPassword: form.password,
		ownerPassword: hasOwner ? form.ownerPassword : form.password,
		permissions: hasOwner ? form.permissions : ALL_ALLOWED,
	};
};

export const validateProtect = (
	form: ProtectForm,
): Effect.Effect<ProtectJob, EmptyPasswordError | PasswordMismatchError> => {
	const issue = protectFormIssue(form);

	if (issue === "empty") {
		return Effect.fail(
			new EmptyPasswordError({ message: m.pdfpw_error_empty() }),
		);
	}

	if (issue === "mismatch") {
		return Effect.fail(
			new PasswordMismatchError({ message: m.pdfpw_error_mismatch() }),
		);
	}

	return Effect.succeed(normalizeProtect(form));
};

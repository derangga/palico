import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
	normalizeProtect,
	protectFormIssue,
	validateProtect,
} from "./protect-form.ts";
import { ALL_ALLOWED, outputName, type ProtectForm } from "./shapes.ts";
import { passwordStrength } from "./strength.ts";

const form = (over: Partial<ProtectForm> = {}): ProtectForm => ({
	password: "correct horse",
	confirm: "correct horse",
	ownerPassword: "",
	permissions: ALL_ALLOWED,
	...over,
});

describe("protectFormIssue", () => {
	it("refuses an empty password", () => {
		expect(protectFormIssue(form({ password: "", confirm: "" }))).toBe("empty");
	});

	it("refuses fields that differ", () => {
		expect(protectFormIssue(form({ confirm: "correct hors" }))).toBe(
			"mismatch",
		);

		expect(protectFormIssue(form({ confirm: "" }))).toBe("mismatch");
	});

	it("passes matching fields", () => {
		expect(protectFormIssue(form())).toBeUndefined();
	});

	it("does not trim: a trailing space is part of the password", () => {
		expect(protectFormIssue(form({ confirm: "correct horse " }))).toBe(
			"mismatch",
		);
	});
});

describe("validateProtect", () => {
	const run = (input: ProtectForm) =>
		Effect.runSyncExit(validateProtect(input));

	it("fails with a tagged error before any work", () => {
		const empty = run(form({ password: "", confirm: "" }));
		const mismatch = run(form({ confirm: "nope" }));

		expect(Exit.isFailure(empty) && JSON.stringify(empty.cause)).toContain(
			"EmptyPasswordError",
		);

		expect(
			Exit.isFailure(mismatch) && JSON.stringify(mismatch.cause),
		).toContain("PasswordMismatchError");
	});

	it("returns the job for a valid form", () => {
		const exit = run(form());

		expect(Exit.isSuccess(exit) && exit.value).toMatchObject({
			mode: "protect",
			userPassword: "correct horse",
		});
	});
});

describe("normalizeProtect", () => {
	const restricted = { print: false, copy: false, edit: false };

	it("uses the open password as the owner password when none is given", () => {
		expect(normalizeProtect(form()).ownerPassword).toBe("correct horse");
	});

	it("keeps every permission on without an owner password", () => {
		// The limits could be lifted by anyone who knows the open password.
		expect(
			normalizeProtect(form({ permissions: restricted })).permissions,
		).toEqual(ALL_ALLOWED);
	});

	it("applies the permissions once there is an owner password", () => {
		const job = normalizeProtect(
			form({ ownerPassword: "boss", permissions: restricted }),
		);

		expect(job.ownerPassword).toBe("boss");
		expect(job.permissions).toEqual(restricted);
	});
});

describe("passwordStrength", () => {
	it("is a hint on a scale, and empty for nothing", () => {
		expect(passwordStrength("")).toBe("empty");
		expect(passwordStrength("abc")).toBe("weak");
		expect(passwordStrength("Tr0ub4dor")).toBe("fair");
		expect(passwordStrength("correct horse battery staple")).toBe("strong");
	});

	it("calls common passwords and repeats weak however long", () => {
		expect(passwordStrength("password")).toBe("weak");
		expect(passwordStrength("Password")).toBe("weak");
		expect(passwordStrength("aaaaaaaaaaaaaaaaaaaa")).toBe("weak");
		expect(passwordStrength("123456789")).toBe("weak");
	});

	it("rewards length over symbols", () => {
		expect(passwordStrength("Xy!9")).toBe("weak");
		expect(passwordStrength("abcdefghijklmnop")).toBe("strong");
	});
});

describe("outputName", () => {
	it("adds the mode to the file name", () => {
		expect(outputName("report.pdf", "protect")).toBe("report_protected.pdf");
		expect(outputName("report.PDF", "unlock")).toBe("report_unlocked.pdf");
	});

	it("only strips a trailing .pdf", () => {
		expect(outputName("a.pdf.pdf", "protect")).toBe("a.pdf_protected.pdf");
		expect(outputName("notes", "unlock")).toBe("notes_unlocked.pdf");
	});

	it("falls back to a name when nothing is left", () => {
		expect(outputName(".pdf", "protect")).toBe("document_protected.pdf");
	});
});

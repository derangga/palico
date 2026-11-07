import { describe, expect, it } from "vitest";

import type { QpdfStepResult } from "#/lib/qpdf/types.ts";

import { classifyProtect, classifyUnlock } from "./classify.ts";

// The text below is what qpdf 12.2.0 (the wasm build we ship) really writes.

const ok = (stdout: string[] = []): QpdfStepResult => ({
	exitCode: 0,
	stdout,
	stderr: [],
});

const bad = (stderr: string[], exitCode = 2): QpdfStepResult => ({
	exitCode,
	stdout: [],
	stderr,
});

const NOT_ENCRYPTED = ok(["File is not encrypted"]);

const ENCRYPTED = ok([
	"R = 6",
	"P = -4",
	"User password = secret",
	"Supplied password is user password",
	"stream encryption method: AESv3",
	"string encryption method: AESv3",
	"file encryption method: AESv3",
]);

const WRONG = bad(["run.cjs: /input.pdf: invalid password"]);

describe("classifyUnlock", () => {
	const passing = [ENCRYPTED, ok(["2"]), ok(), NOT_ENCRYPTED];

	it("accepts a clean run and reports the page count", () => {
		expect(classifyUnlock(passing, true)).toEqual({ ok: true, pageCount: 2 });
	});

	it("reads qpdf's 'invalid password' as a wrong password", () => {
		expect(classifyUnlock([WRONG], false)).toMatchObject({
			ok: false,
			reason: "wrong-password",
		});
	});

	it("reads certificate security as unsupported encryption", () => {
		const pubsec = bad([
			"run.cjs: /input.pdf (encryption dictionary, offset 355): unsupported encryption filter",
		]);

		expect(classifyUnlock([pubsec], false)).toMatchObject({
			ok: false,
			reason: "unsupported-encryption",
		});
	});

	it("says a file with no password is not encrypted", () => {
		expect(classifyUnlock([NOT_ENCRYPTED, ok(["1"]), ok()], true)).toEqual({
			ok: false,
			reason: "not-encrypted",
		});
	});

	it("treats exit code 3 (warnings) as success", () => {
		const warned = { ...ok(), exitCode: 3 };

		expect(
			classifyUnlock([ENCRYPTED, ok(["2"]), warned, NOT_ENCRYPTED], true),
		).toEqual({ ok: true, pageCount: 2 });
	});

	it("calls a file qpdf cannot read invalid, and keeps the last line for the console", () => {
		const garbage = bad([
			"WARNING: /input.pdf: can't find PDF header",
			"run.cjs: /input.pdf: can't find startxref",
		]);

		expect(classifyUnlock([garbage], false)).toEqual({
			ok: false,
			reason: "invalid",
			detail: "run.cjs: /input.pdf: can't find startxref",
		});
	});

	it("fails the check when the output is still encrypted", () => {
		expect(
			classifyUnlock([ENCRYPTED, ok(["2"]), ok(), ENCRYPTED], true),
		).toMatchObject({
			ok: false,
			reason: "verify-failed",
		});
	});

	it("is invalid when qpdf wrote no output", () => {
		expect(classifyUnlock(passing, false)).toMatchObject({
			ok: false,
			reason: "invalid",
		});
	});

	it("reports a worker problem when no step ran at all", () => {
		expect(classifyUnlock([], false)).toMatchObject({
			ok: false,
			reason: "worker",
		});
	});
});

describe("classifyProtect", () => {
	const passing = [NOT_ENCRYPTED, ok(["3"]), ok(), ENCRYPTED];

	it("accepts a clean run and reports the page count", () => {
		expect(classifyProtect(passing, true)).toEqual({ ok: true, pageCount: 3 });
	});

	it("says a source that asks for a password is already encrypted, not a wrong password", () => {
		expect(classifyProtect([WRONG], false)).toMatchObject({
			ok: false,
			reason: "source-encrypted",
		});
	});

	it("still reports certificate security on the source", () => {
		const pubsec = bad(["run.cjs: /input.pdf: unsupported encryption filter"]);

		expect(classifyProtect([pubsec], false)).toMatchObject({
			ok: false,
			reason: "unsupported-encryption",
		});
	});

	it("passes a source with only an owner password (it opens without one)", () => {
		const ownerOnly = ok(["R = 6", "User password = "]);

		expect(
			classifyProtect([ownerOnly, ok(["3"]), ok(), ENCRYPTED], true),
		).toEqual({ ok: true, pageCount: 3 });
	});

	it("fails the check unless the output is revision 6 with AES-256", () => {
		const aes128 = ok(["R = 4", "stream encryption method: AESv2"]);

		expect(
			classifyProtect([NOT_ENCRYPTED, ok(["3"]), ok(), aes128], true),
		).toMatchObject({
			ok: false,
			reason: "verify-failed",
		});
	});

	it("fails the check when the read-back says not encrypted", () => {
		expect(
			classifyProtect([NOT_ENCRYPTED, ok(["3"]), ok(), NOT_ENCRYPTED], true),
		).toMatchObject({ ok: false, reason: "verify-failed" });
	});
});

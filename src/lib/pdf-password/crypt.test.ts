// End to end against the real qpdf wasm (the same build the app ships), run in node.
// Only the pdf.js re-open is faked, because pdf.js needs a browser worker. The
// command lines, the exit codes and the classification are all the real thing.

import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import { nodeHooks, wasmBytes as wasm } from "#/lib/qpdf/fakes.ts";
import { runQpdf } from "#/lib/qpdf/run.ts";
import { scrub } from "#/lib/qpdf/scrub.ts";
import type { QpdfRunResult } from "#/lib/qpdf/types.ts";

import { type CryptDeps, executeCrypt, type VerifyRequest } from "./crypt.ts";
import {
	ALL_ALLOWED,
	type CryptJob,
	type CryptOutcome,
	type Permissions,
} from "./shapes.ts";

const withRealQpdf = (verify: CryptDeps["verify"]): CryptDeps => ({
	runQpdf: (params) => runQpdf({ wasm, hooks: nodeHooks, ...params }),
	verify,
});

const passes: CryptDeps["verify"] = () => Promise.resolve(true);

const pdfWithPages = async (pages: number): Promise<Uint8Array> => {
	const doc = await PDFDocument.create();

	for (let i = 0; i < pages; i += 1) doc.addPage([200 + i, 300]);

	return doc.save();
};

const protect = (
	userPassword: string,
	ownerPassword = userPassword,
	permissions: Permissions = ALL_ALLOWED,
): CryptJob => ({ mode: "protect", userPassword, ownerPassword, permissions });

const unlock = (password: string): CryptJob => ({ mode: "unlock", password });

const must = (outcome: CryptOutcome) => {
	if (!outcome.ok) throw new Error(`expected success, got ${outcome.reason}`);

	return outcome;
};

// What qpdf says about a finished file, to check what really happened to it.
const inspect = async (
	bytes: Uint8Array,
	args: string[],
): Promise<QpdfRunResult["steps"][number]> => {
	const run = await runQpdf({
		wasm,
		hooks: nodeHooks,
		inputs: [{ path: "/f.pdf", bytes }],
		steps: [{ args: [...args, "/f.pdf"] }],
		outputs: [],
	});

	const [step] = run.steps;

	if (!step) throw new Error("qpdf ran nothing");

	return step;
};

let source: Uint8Array;

beforeAll(async () => {
	source = await pdfWithPages(3);
});

describe("Protect", () => {
	it("makes an AES-256 file that needs the password, with the same pages", async () => {
		const seen: VerifyRequest[] = [];

		const out = must(
			await executeCrypt(
				protect("open sesame"),
				source,
				withRealQpdf((request) => {
					seen.push(request);

					return Promise.resolve(true);
				}),
			),
		);

		expect(out.pageCount).toBe(3);

		const shown = await inspect(out.bytes, [
			"--show-encryption",
			"--password=open sesame",
		]);

		expect(shown.stdout).toContain("R = 6");
		expect(shown.stdout).toContain("stream encryption method: AESv3");

		const without = await inspect(out.bytes, ["--show-encryption"]);

		expect(without.stderr.join()).toContain("invalid password");

		// The re-open is asked to open with the password and to expect a refusal
		// without it, against the page count qpdf read from the source.
		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatchObject({
			password: "open sesame",
			expectPages: 3,
			expectPasswordRequired: true,
		});
	});

	it("applies the permissions when there is a separate owner password", async () => {
		const out = must(
			await executeCrypt(
				protect("open", "boss", { print: false, copy: false, edit: false }),
				source,
				withRealQpdf(passes),
			),
		);

		const shown = await inspect(out.bytes, [
			"--show-encryption",
			"--password=boss",
		]);

		expect(shown.stdout).toContain("print high resolution: not allowed");
		expect(shown.stdout).toContain("extract for any purpose: not allowed");
		expect(shown.stdout).toContain("modify anything: not allowed");
		expect(shown.stdout).toContain("extract for accessibility: allowed");
	});

	it("turns on only the permissions that were left on", async () => {
		const out = must(
			await executeCrypt(
				protect("open", "boss", { print: true, copy: false, edit: true }),
				source,
				withRealQpdf(passes),
			),
		);

		const shown = await inspect(out.bytes, [
			"--show-encryption",
			"--password=boss",
		]);

		expect(shown.stdout).toContain("print high resolution: allowed");
		expect(shown.stdout).toContain("extract for any purpose: not allowed");
		expect(shown.stdout).toContain("modify anything: allowed");
	});

	it.each([
		["a leading dash", "--looks-like-an-option"],
		["spaces and quotes", ` it's "quoted" `],
		["non-Latin text", "pässwörd 密码 🔑"],
		["an equals sign", "a=b=c"],
	])("handles a password with %s", async (_label, secret) => {
		const locked = must(
			await executeCrypt(protect(secret), source, withRealQpdf(passes)),
		);

		const back = must(
			await executeCrypt(unlock(secret), locked.bytes, withRealQpdf(passes)),
		);

		expect(back.pageCount).toBe(3);
	});

	it("refuses a source that already needs a password, as 'already encrypted'", async () => {
		const locked = must(
			await executeCrypt(protect("x"), source, withRealQpdf(passes)),
		);

		expect(
			await executeCrypt(protect("y"), locked.bytes, withRealQpdf(passes)),
		).toMatchObject({ ok: false, reason: "source-encrypted" });
	});

	it("fails with 'invalid' for something that is not a PDF", async () => {
		expect(
			await executeCrypt(
				protect("x"),
				new TextEncoder().encode("hello"),
				withRealQpdf(passes),
			),
		).toMatchObject({ ok: false, reason: "invalid" });
	});

	it("does not offer the file when the re-open fails", async () => {
		expect(
			await executeCrypt(
				protect("x"),
				source,
				withRealQpdf(() => Promise.resolve(false)),
			),
		).toEqual({ ok: false, reason: "verify-failed" });
	});
});

describe("Unlock", () => {
	let locked: Uint8Array;

	beforeAll(async () => {
		locked = must(
			await executeCrypt(protect("right"), source, withRealQpdf(passes)),
		).bytes;
	});

	it("removes the password and keeps the pages", async () => {
		const seen: VerifyRequest[] = [];

		const out = must(
			await executeCrypt(
				unlock("right"),
				locked,
				withRealQpdf((request) => {
					seen.push(request);

					return Promise.resolve(true);
				}),
			),
		);

		expect(out.pageCount).toBe(3);

		const shown = await inspect(out.bytes, ["--show-encryption"]);

		expect(shown.stdout).toContain("File is not encrypted");

		// The re-open uses no password and expects none to be needed.
		expect(seen[0]).toMatchObject({
			password: undefined,
			expectPages: 3,
			expectPasswordRequired: false,
		});
	});

	it("reports a wrong password, again and again, with no lockout", async () => {
		const reasons: string[] = [];

		for (const attempt of ["nope", "still nope", ""]) {
			const outcome = await executeCrypt(
				unlock(attempt),
				locked,
				withRealQpdf(passes),
			);

			reasons.push(outcome.ok ? "ok" : outcome.reason);
		}

		expect(reasons).toEqual([
			"wrong-password",
			"wrong-password",
			"wrong-password",
		]);

		// And the right one still works afterwards.
		expect(
			(await executeCrypt(unlock("right"), locked, withRealQpdf(passes))).ok,
		).toBe(true);
	});

	it("opens a file with only an owner password with no password", async () => {
		const ownerOnly = await runQpdf({
			wasm,
			hooks: nodeHooks,
			inputs: [{ path: "/in.pdf", bytes: source }],
			steps: [
				{
					args: [
						"--encrypt",
						"--user-password=",
						"--owner-password=boss",
						"--bits=256",
						"--print=none",
						"--",
						"/in.pdf",
						"/out.pdf",
					],
				},
			],
			outputs: ["/out.pdf"],
		});

		const bytes = ownerOnly.outputs[0]?.bytes;

		if (!bytes) throw new Error("no owner-only file");

		const out = must(
			await executeCrypt(unlock(""), bytes, withRealQpdf(passes)),
		);

		expect(out.pageCount).toBe(3);

		expect((await inspect(out.bytes, ["--show-encryption"])).stdout).toContain(
			"File is not encrypted",
		);
	});

	it("says a file with no password has nothing to unlock", async () => {
		expect(
			await executeCrypt(unlock("x"), source, withRealQpdf(passes)),
		).toEqual({ ok: false, reason: "not-encrypted" });
	});

	it("says certificate security can't be unlocked with a password", async () => {
		const certificate = handBuiltPdf(
			"<</Filter/Adobe.PubSec/SubFilter/adbe.pkcs7.s5/V 4/Length 128/CF<</DefaultCryptFilter<</CFM/AESV2/Recipients[(abc)]>>>>/StmF/DefaultCryptFilter/StrF/DefaultCryptFilter>>",
		);

		expect(
			await executeCrypt(unlock("x"), certificate, withRealQpdf(passes)),
		).toMatchObject({ ok: false, reason: "unsupported-encryption" });
	});

	it("treats a security handler it does not know the same way", async () => {
		const unknown = handBuiltPdf("<</Filter/SomethingNew/V 4/Length 128>>");

		expect(
			await executeCrypt(unlock("x"), unknown, withRealQpdf(passes)),
		).toMatchObject({ ok: false, reason: "unsupported-encryption" });
	});

	it("does not offer the file when the re-open fails", async () => {
		expect(
			await executeCrypt(
				unlock("right"),
				locked,
				withRealQpdf(() => Promise.resolve(false)),
			),
		).toEqual({ ok: false, reason: "verify-failed" });
	});
});

describe("passwords stay out of failure text", () => {
	it("scrubs every secret from a qpdf message", () => {
		expect(
			scrub("bad /in.pdf --password=hunter2 owner=boss", ["hunter2", "boss"]),
		).toBe("bad /in.pdf --password=*** owner=***");
	});

	it("leaves the text alone for an empty secret", () => {
		expect(scrub("abc", [""])).toBe("abc");
		expect(scrub(undefined, ["x"])).toBeUndefined();
	});

	it("scrubs the detail of a failed job", async () => {
		const leaky: CryptDeps = {
			runQpdf: () =>
				Promise.resolve({
					steps: [
						{
							exitCode: 2,
							stdout: [],
							stderr: ["something odd with hunter2 happened"],
						},
					],
					outputs: [],
				}),
			verify: passes,
		};

		const outcome = await executeCrypt(unlock("hunter2"), source, leaky);

		expect(outcome).toMatchObject({ ok: false, reason: "invalid" });
		expect(JSON.stringify(outcome)).not.toContain("hunter2");
	});
});

// A tiny valid PDF whose trailer points at the given /Encrypt dictionary.
function handBuiltPdf(encrypt: string): Uint8Array {
	const objects = [
		"<</Type/Catalog/Pages 2 0 R>>",
		"<</Type/Pages/Kids[3 0 R]/Count 1>>",
		"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>",
		encrypt,
	];

	let text = "%PDF-1.7\n";
	const offsets: number[] = [];

	objects.forEach((body, index) => {
		offsets.push(text.length);
		text += `${index + 1} 0 obj\n${body}\nendobj\n`;
	});

	const xref = text.length;
	text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

	for (const offset of offsets) {
		text += `${String(offset).padStart(10, "0")} 00000 n \n`;
	}

	text += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R/Encrypt 4 0 R/ID[<00112233445566778899aabbccddeeff><00112233445566778899aabbccddeeff>]>>\nstartxref\n${xref}\n%%EOF\n`;

	return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

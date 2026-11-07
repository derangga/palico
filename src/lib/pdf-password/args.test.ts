import { describe, expect, it } from "vitest";

import {
	buildProtectArgs,
	buildUnlockArgs,
	INPUT_PATH,
	OUTPUT_PATH,
	permissionArgs,
	protectSteps,
	unlockSteps,
} from "./args.ts";
import { ALL_ALLOWED, type ProtectJob } from "./shapes.ts";

const job = (over: Partial<ProtectJob> = {}): ProtectJob => ({
	mode: "protect",
	userPassword: "open-sesame",
	ownerPassword: "boss",
	permissions: ALL_ALLOWED,
	...over,
});

describe("permissionArgs", () => {
	it("allows everything when every permission is on", () => {
		expect(permissionArgs(ALL_ALLOWED)).toEqual([
			"--print=full",
			"--extract=y",
			"--modify=all",
			"--accessibility=y",
		]);
	});

	it("maps each permission to its own qpdf option", () => {
		expect(permissionArgs({ print: false, copy: true, edit: true })).toContain(
			"--print=none",
		);

		expect(permissionArgs({ print: true, copy: false, edit: true })).toContain(
			"--extract=n",
		);

		expect(permissionArgs({ print: true, copy: true, edit: false })).toContain(
			"--modify=none",
		);
	});

	it("keeps accessibility on even when everything else is off", () => {
		expect(
			permissionArgs({ print: false, copy: false, edit: false }),
		).toContain("--accessibility=y");
	});
});

describe("buildProtectArgs", () => {
	it("encrypts with AES-256 and names both passwords as flags", () => {
		expect(buildProtectArgs(job())).toEqual([
			"--encrypt",
			"--user-password=open-sesame",
			"--owner-password=boss",
			"--bits=256",
			"--print=full",
			"--extract=y",
			"--modify=all",
			"--accessibility=y",
			"--",
			INPUT_PATH,
			OUTPUT_PATH,
		]);
	});

	it("ends the encryption options with -- before the file names", () => {
		const args = buildProtectArgs(job());

		expect(args.indexOf("--")).toBeGreaterThan(args.indexOf("--bits=256"));
		expect(args.slice(-3)).toEqual(["--", INPUT_PATH, OUTPUT_PATH]);
	});

	it("passes a password that starts with a dash as a flag value, not an option", () => {
		const args = buildProtectArgs(
			job({ userPassword: "--oops", ownerPassword: "-x" }),
		);

		expect(args).toContain("--user-password=--oops");
		expect(args).toContain("--owner-password=-x");
		// Never as a bare argument qpdf could read as an option.
		expect(args).not.toContain("--oops");
	});

	it("keeps spaces, quotes and non-Latin text exactly as typed", () => {
		const secret = ` a "b" 'c' pä=ss 密码 `;

		expect(buildProtectArgs(job({ userPassword: secret }))).toContain(
			`--user-password=${secret}`,
		);
	});
});

describe("buildUnlockArgs", () => {
	it("decrypts with the password as a flag", () => {
		expect(buildUnlockArgs("pw")).toEqual([
			"--decrypt",
			"--password=pw",
			INPUT_PATH,
			OUTPUT_PATH,
		]);
	});

	it("accepts an empty password, for a file with only an owner password", () => {
		expect(buildUnlockArgs("")).toContain("--password=");
	});
});

describe("steps", () => {
	it("protect looks at the source, counts pages, encrypts, then reads the output back", () => {
		const steps = protectSteps(job());

		expect(steps.map((step) => step.args[0])).toEqual([
			"--show-encryption",
			"--show-npages",
			"--encrypt",
			"--show-encryption",
		]);

		// The read-back uses the new open password.
		expect(steps[3]?.args).toContain("--password=open-sesame");
		expect(steps[3]?.args.at(-1)).toBe(OUTPUT_PATH);
	});

	it("unlock checks the password first, and reads the output back without one", () => {
		const steps = unlockSteps("pw");

		expect(steps.map((step) => step.args[0])).toEqual([
			"--show-encryption",
			"--show-npages",
			"--decrypt",
			"--show-encryption",
		]);

		expect(steps[0]?.args).toContain("--password=pw");
		expect(steps[3]?.args.some((arg) => arg.startsWith("--password"))).toBe(
			false,
		);
	});
});

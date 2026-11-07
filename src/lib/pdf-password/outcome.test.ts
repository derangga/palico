import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { PdfEngineLoadError } from "#/lib/qpdf/errors.ts";

import { WrongPasswordError } from "./errors.ts";
import { toCryptError } from "./map-error.ts";
import { runProtect, runUnlock } from "./outcome.ts";
import { PdfCrypt, type PdfCryptApi } from "./service.ts";
import { ALL_ALLOWED, type CryptJob } from "./shapes.ts";

// The same graph the page runs, with the worker swapped for a fake behind R.
const fake = (api: PdfCryptApi["run"]) => {
	const jobs: CryptJob[] = [];

	const layer = Layer.succeed(PdfCrypt, {
		run: (params) => {
			jobs.push(params.job);

			return api(params);
		},
	});

	return { jobs, layer };
};

const pdf = () => new File([new Uint8Array([1, 2, 3])], "report.pdf");

const protectForm = {
	password: "pw-one",
	confirm: "pw-one",
	ownerPassword: "",
	permissions: ALL_ALLOWED,
};

const succeed = () =>
	Effect.succeed({ bytes: new Uint8Array([9, 9]).buffer, pageCount: 2 });

describe("runProtect", () => {
	it("returns the file under the protected name", async () => {
		const { layer, jobs } = fake(succeed);

		const outcome = await Effect.runPromise(
			runProtect(pdf(), protectForm).pipe(Effect.provide(layer)),
		);

		expect(outcome).toMatchObject({
			kind: "done",
			name: "report_protected.pdf",
			pageCount: 2,
		});

		expect(jobs).toEqual([
			{
				mode: "protect",
				userPassword: "pw-one",
				ownerPassword: "pw-one",
				permissions: ALL_ALLOWED,
			},
		]);
	});

	it("stops a mismatch before any work runs", async () => {
		const { layer, jobs } = fake(succeed);

		const outcome = await Effect.runPromise(
			runProtect(pdf(), { ...protectForm, confirm: "pw-two" }).pipe(
				Effect.provide(layer),
			),
		);

		expect(outcome).toMatchObject({ kind: "field", field: "confirm" });
		expect(jobs).toHaveLength(0);
	});

	it("stops an empty password before any work runs", async () => {
		const { layer, jobs } = fake(succeed);

		const outcome = await Effect.runPromise(
			runProtect(pdf(), { ...protectForm, password: "", confirm: "" }).pipe(
				Effect.provide(layer),
			),
		);

		expect(outcome).toMatchObject({ kind: "field", field: "password" });
		expect(jobs).toHaveLength(0);
	});

	it("stops a file over the size limit before reading it", async () => {
		const { layer, jobs } = fake(succeed);
		const big = new File([], "huge.pdf");
		Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });

		const outcome = await Effect.runPromise(
			runProtect(big, protectForm).pipe(Effect.provide(layer)),
		);

		expect(outcome.kind).toBe("failed");
		expect(jobs).toHaveLength(0);
	});

	it("sends a file that is already locked to a blocking message", async () => {
		const { layer } = fake(() =>
			Effect.fail(toCryptError("report.pdf", "source-encrypted", undefined)),
		);

		const outcome = await Effect.runPromise(
			runProtect(pdf(), protectForm).pipe(Effect.provide(layer)),
		);

		expect(outcome.kind).toBe("blocked");
	});
});

describe("runUnlock", () => {
	it("returns the file under the unlocked name", async () => {
		const { layer, jobs } = fake(succeed);

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "").pipe(Effect.provide(layer)),
		);

		expect(outcome).toMatchObject({
			kind: "done",
			name: "report_unlocked.pdf",
		});
		// An empty password still runs: a file with only an owner password opens with none.
		expect(jobs).toEqual([{ mode: "unlock", password: "" }]);
	});

	it("puts a wrong password on the field, so it can turn red and keep focus", async () => {
		const { layer } = fake(() =>
			Effect.fail(new WrongPasswordError({ message: "wrong" })),
		);

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "x").pipe(Effect.provide(layer)),
		);

		expect(outcome).toEqual({
			kind: "field",
			field: "password",
			message: "wrong",
		});
	});

	it("allows unlimited retries: each run starts clean", async () => {
		let calls = 0;

		const { layer } = fake(() => {
			calls += 1;

			return calls < 4
				? Effect.fail(new WrongPasswordError({ message: "wrong" }))
				: succeed();
		});

		const kinds: string[] = [];

		for (let i = 0; i < 4; i += 1) {
			const outcome = await Effect.runPromise(
				runUnlock(pdf(), `try-${i}`).pipe(Effect.provide(layer)),
			);

			kinds.push(outcome.kind);
		}

		expect(kinds).toEqual(["field", "field", "field", "done"]);
	});

	it("says certificate security can't be unlocked, without a field to fix", async () => {
		const { layer } = fake(() =>
			Effect.fail(
				toCryptError("report.pdf", "unsupported-encryption", undefined),
			),
		);

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "x").pipe(Effect.provide(layer)),
		);

		expect(outcome).toMatchObject({ kind: "blocked" });
		expect(outcome.kind === "blocked" && outcome.message).toContain(
			"certificate, not a password",
		);
	});

	it("hands an engine failure to the engine card, which offers Try again", async () => {
		const { layer } = fake(() =>
			Effect.fail(
				new PdfEngineLoadError({ stage: "starting", message: "offline" }),
			),
		);

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "x").pipe(Effect.provide(layer)),
		);

		expect(outcome).toEqual({ kind: "engine", message: "offline" });
	});

	it("turns a defect into a failed outcome instead of rejecting", async () => {
		const { layer } = fake(() => Effect.die(new Error("boom")));

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "x").pipe(Effect.provide(layer)),
		);

		expect(outcome.kind).toBe("failed");
	});

	it("toasts a failure that has no place of its own", async () => {
		const { layer } = fake(() =>
			Effect.fail(toCryptError("report.pdf", "verify-failed", undefined)),
		);

		const outcome = await Effect.runPromise(
			runUnlock(pdf(), "x").pipe(Effect.provide(layer)),
		);

		expect(outcome.kind).toBe("failed");
	});
});

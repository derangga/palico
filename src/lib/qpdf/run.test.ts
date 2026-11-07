// The qpdf glue code behaves differently in a worker than in node, and node is where
// the other tests run it. These tests load the shipped glue into a `vm` context that
// looks like a dedicated worker (no `process`, a `WorkerGlobalScope`, `self.location`,
// and a `fetch` that records what it is asked for), to pin down where the wasm comes
// from. The first version of the runner passed `wasmBinary`, which this build ignores;
// in a real worker it then fetched `qpdf.wasm` from beside the worker script and got a
// 404. Node tests could not see that.

import { resolveObjectURL } from "node:buffer";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import { nodeHooks, WASM_PATH, wasmBytes } from "./fakes.ts";
import { answerQpdfRun } from "./handle.ts";
import type { QpdfRunRequest } from "./protocol.ts";
import { type QpdfHooks, QpdfStartError, runQpdf } from "./run.ts";

const GLUE = readFileSync(
	"node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js",
	"utf8",
);

const WORKER_SCRIPT = "https://palico.test/assets/pdf-crypt.worker-abc123.js";

type Factory = NonNullable<QpdfHooks["create"]>;

type WithBinary = (options: { wasmBinary: ArrayBuffer }) => ReturnType<Factory>;

// The glue, evaluated as a worker would see it. `answer` decides what a fetch of a
// given URL returns; every URL asked for is recorded.
const glueInFakeWorker = (answer: (url: string) => Promise<Response>) => {
	const fetched: string[] = [];

	const sandbox = {
		module: { exports: {} },
		exports: {},
		console,
		TextDecoder,
		TextEncoder,
		URL,
		WorkerGlobalScope: class {},
		self: { location: { href: WORKER_SCRIPT } },
		fetch: (url: URL | string) => {
			const href = String(url);

			fetched.push(href);

			return answer(href);
		},
		// The glue falls back to a synchronous request when fetch fails.
		XMLHttpRequest: class {
			response = new ArrayBuffer(0);
			status = 404;
			responseType = "";
			open(_method: string, url: string) {
				fetched.push(url);
			}
			send() {}
		},
	};

	createContext(sandbox);
	runInContext(GLUE, sandbox);

	const exported = sandbox.module.exports;

	// SAFETY: the glue assigns its factory to module.exports, and this is the shape
	// the runner calls it with.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the vm context is untyped, so TypeScript needs the hop through unknown.
	const create = exported as unknown as Factory;

	// SAFETY: the same factory, called the way the first version of the runner did.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the vm context is untyped, so TypeScript needs the hop through unknown.
	const createWithBinary = exported as unknown as WithBinary;

	return { create, createWithBinary, fetched };
};

// What the wasm URL points at: the bytes behind a blob URL, like a browser would serve.
const serveBlobs = async (url: string): Promise<Response> => {
	const blob = resolveObjectURL(url);

	return blob
		? new Response(await blob.arrayBuffer(), {
				headers: { "content-type": "application/wasm" },
			})
		: new Response("not found", { status: 404 });
};

const OUTPUT = { inputs: [], outputs: [] };

describe("the qpdf glue in a worker", () => {
	it("ignores wasmBinary and fetches qpdf.wasm from beside the worker script", async () => {
		// Pins the behaviour that broke the first version. If a newer glue starts
		// honouring wasmBinary, this test says so and the blob URL can go.
		// The glue logs its failure to the console; keep the test output quiet.
		const quiet = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		const { createWithBinary, fetched } = glueInFakeWorker(serveBlobs);

		await createWithBinary({ wasmBinary: wasmBytes }).catch(() => undefined);
		quiet.mockRestore();

		expect(fetched).toContain("https://palico.test/assets/qpdf.wasm");
	});

	it("starts from the supplied bytes, and asks for nothing at a sibling path", async () => {
		const { create, fetched } = glueInFakeWorker(serveBlobs);

		const run = await runQpdf({
			wasm: wasmBytes,
			...OUTPUT,
			steps: [{ args: ["--version"] }],
			hooks: { create },
		});

		expect(run.steps[0]?.exitCode).toBe(0);
		expect(run.steps[0]?.stdout.join("\n")).toContain("version 12.");

		// Everything it fetched was the one blob URL the runner made.
		expect(fetched.length).toBeGreaterThan(0);
		expect(new Set(fetched).size).toBe(1);
		expect(fetched.every((url) => url.startsWith("blob:"))).toBe(true);
		expect(fetched.some((url) => url.includes("qpdf.wasm"))).toBe(false);
	});

	it("revokes the blob URL once the engine has started", async () => {
		const { create, fetched } = glueInFakeWorker(serveBlobs);

		await runQpdf({
			wasm: wasmBytes,
			...OUTPUT,
			steps: [],
			hooks: { create },
		});

		const [url] = fetched;

		expect(url).toBeDefined();
		expect(resolveObjectURL(url ?? "")).toBeUndefined();
	});

	it("puts what the glue said into the start failure", async () => {
		// A wasm URL that 404s: the glue logs why it failed before it gives up, and
		// that line is the useful part of the error.
		const { create } = glueInFakeWorker(() =>
			Promise.resolve(new Response("nope", { status: 404 })),
		);

		const failure = await runQpdf({
			wasm: wasmBytes,
			...OUTPUT,
			steps: [],
			hooks: {
				create,
				locate: () => ({
					url: "https://palico.test/missing.wasm",
					release: () => undefined,
				}),
			},
		}).catch((cause: unknown) => cause);

		expect(failure).toBeInstanceOf(QpdfStartError);
		expect(failure instanceof Error ? failure.message : "").toContain(
			"failed to asynchronously prepare wasm",
		);
	});

	it("puts the console back after a failed start", async () => {
		const { create } = glueInFakeWorker(() =>
			Promise.resolve(new Response("nope", { status: 404 })),
		);

		const before = { log: console.log, error: console.error };

		await runQpdf({
			wasm: wasmBytes,
			...OUTPUT,
			steps: [],
			hooks: {
				create,
				locate: () => ({
					url: "https://palico.test/x.wasm",
					release: () => undefined,
				}),
			},
		}).catch(() => undefined);

		expect(console.log).toBe(before.log);
		expect(console.error).toBe(before.error);
	});
});

describe("the generic qpdf-run request", () => {
	const request = async (
		over: Partial<QpdfRunRequest> = {},
	): Promise<QpdfRunRequest> => {
		const doc = await PDFDocument.create();
		doc.addPage([100, 100]);
		doc.addPage([100, 100]);
		const saved = await doc.save();

		return {
			type: "qpdf-run",
			id: "job-1",
			wasmUrl: WASM_PATH,
			inputs: [{ path: "/in.pdf", bytes: saved.slice().buffer }],
			steps: [
				{ args: ["--show-npages", "/in.pdf"] },
				{ args: ["/in.pdf", "--pages", ".", "1", "--", "/out.pdf"] },
			],
			outputs: ["/out.pdf", "/missing.pdf"],
			...over,
		};
	};

	const deps = {
		loadWasm: () => Promise.resolve(wasmBytes),
		hooks: nodeHooks,
	};

	it("runs any command lines and returns their text and the files that exist", async () => {
		const answer = await answerQpdfRun(await request(), deps);

		expect(answer.message).toMatchObject({
			type: "qpdf-run-done",
			id: "job-1",
			steps: [{ exitCode: 0, stdout: ["2"] }, { exitCode: 0 }],
		});

		if (answer.message.type !== "qpdf-run-done") throw new Error("not done");

		// Only the output that exists comes back, and its bytes are transferred.
		expect(answer.message.outputs.map((file) => file.path)).toEqual([
			"/out.pdf",
		]);

		expect(answer.transfer).toHaveLength(1);

		// The one-page copy really has one page.
		const second = await answerQpdfRun(
			{
				...(await request()),
				inputs: [
					{
						path: "/in.pdf",
						bytes: answer.message.outputs[0]?.bytes ?? new ArrayBuffer(0),
					},
				],
				steps: [{ args: ["--show-npages", "/in.pdf"] }],
				outputs: [],
			},
			deps,
		);

		expect(second.message).toMatchObject({ steps: [{ stdout: ["1"] }] });
	});

	it("stops at a failing command and reports its exit code", async () => {
		const answer = await answerQpdfRun(
			await request({
				steps: [
					{ args: ["--show-npages", "/nope.pdf"] },
					{ args: ["--show-npages", "/in.pdf"] },
				],
			}),
			deps,
		);

		if (answer.message.type !== "qpdf-run-done") throw new Error("not done");

		expect(answer.message.steps).toHaveLength(1);
		expect(answer.message.steps[0]?.exitCode).toBe(2);
	});

	it("reports an engine that cannot be loaded, with password flags scrubbed", async () => {
		const answer = await answerQpdfRun(
			await request({
				steps: [
					{ args: ["--decrypt", "--password=hunter2", "/in.pdf", "/out.pdf"] },
				],
			}),
			{
				loadWasm: () => Promise.reject(new Error("offline, tried hunter2")),
			},
		);

		expect(answer.message).toEqual({
			type: "error",
			id: "job-1",
			reason: "engine-load",
			detail: "offline, tried ***",
		});
	});
});

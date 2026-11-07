// The worker's side of the generic `qpdf-run` request, as a function that returns
// the message to post instead of posting it. The worker file only wires it to
// `postMessage`, so the same code runs in tests.

import type { QpdfFailure, QpdfRunDone, QpdfRunRequest } from "./protocol.ts";
import { type QpdfHooks, QpdfStartError, runQpdf } from "./run.ts";
import { passwordsInArgs, scrub } from "./scrub.ts";

// What to post, and what to transfer with it.
export interface Answer<Message> {
	readonly message: Message;
	readonly transfer: ReadonlyArray<Transferable>;
}

export interface AnswerDeps {
	readonly loadWasm: (url: string) => Promise<ArrayBuffer>;
	readonly hooks?: QpdfHooks;
}

export const messageOf = (cause: unknown): string | undefined =>
	cause instanceof Error ? cause.message : undefined;

// A job that could not start the engine failed because of the engine; anything else
// is the worker.
export const failureReason = (cause: unknown): "engine-load" | "worker" =>
	cause instanceof QpdfStartError ? "engine-load" : "worker";

export const answerQpdfRun = async (
	request: QpdfRunRequest,
	deps: AnswerDeps,
): Promise<Answer<QpdfRunDone | QpdfFailure>> => {
	// The only secrets this generic path can know are qpdf's password flags.
	const secrets = passwordsInArgs(request.steps);

	let wasm: ArrayBuffer;

	try {
		wasm = await deps.loadWasm(request.wasmUrl);
	} catch (cause) {
		return {
			message: {
				type: "error",
				id: request.id,
				reason: "engine-load",
				detail: scrub(messageOf(cause), secrets),
			},
			transfer: [],
		};
	}

	try {
		const result = await runQpdf({
			wasm,
			inputs: request.inputs.map((file) => ({
				path: file.path,
				bytes: new Uint8Array(file.bytes),
			})),
			steps: request.steps,
			outputs: request.outputs,
			hooks: deps.hooks,
		});

		const outputs = result.outputs.map((file) => ({
			path: file.path,
			bytes: file.bytes.buffer,
		}));

		return {
			message: {
				type: "qpdf-run-done",
				id: request.id,
				steps: [...result.steps],
				outputs,
			},
			transfer: outputs.map((file) => file.bytes),
		};
	} catch (cause) {
		return {
			message: {
				type: "error",
				id: request.id,
				reason: failureReason(cause),
				detail: scrub(messageOf(cause), secrets),
			},
			transfer: [],
		};
	}
};

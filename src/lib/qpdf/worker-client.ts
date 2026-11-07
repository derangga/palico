// Starts the qpdf worker for one job and waits for its answer. Every tool that uses
// the engine goes through this, so they all get the same lifecycle: a fresh worker
// per job, terminated when the job ends, whether it succeeded, failed or was
// interrupted. That also ends the life of anything the request carried, such as a
// password.

import { Effect, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import { QPDF_WASM_URL } from "./assets.ts";
import { PdfEngineLoadError, QpdfWorkerError } from "./errors.ts";
import { QpdfRunDone, type QpdfRunRequest } from "./protocol.ts";
import { passwordsInArgs, scrub } from "./scrub.ts";
import type { QpdfRunResult } from "./types.ts";

// What the worker says when a job failed. `reason` is the tool's own vocabulary;
// the engine only knows "engine-load" and "worker".
export interface WorkerFailure {
	readonly reason: string;
	readonly detail: string | undefined;
}

// Every message the worker posts for a job carries the job's id. Messages that are
// not ours (dev-tooling chatter) have none, and are ignored.
const Tagged = Schema.Struct({ type: Schema.String, id: Schema.String });

const isTagged = Schema.is(Tagged);

const FailureMessage = Schema.Struct({
	type: Schema.Literal("error"),
	id: Schema.String,
	reason: Schema.String,
	detail: Schema.optional(Schema.String),
});

const isFailureMessage = Schema.is(FailureMessage);

// `new Worker(new URL(...))` has to stay inline so Vite finds and bundles the worker.
const startWorker = () =>
	new Worker(new URL("../../workers/pdf-crypt.worker.ts", import.meta.url), {
		type: "module",
	});

// Runs one job. `isDone` recognises the message that ends the job well; the worker
// ends it badly with an `error` message, which `toError` turns into the tool's error.
export const runInWorker = <
	Request extends { readonly id: string },
	Done,
	E,
>(params: {
	readonly request: Request;
	readonly transfer: ReadonlyArray<Transferable>;
	readonly isDone: (data: unknown) => data is Done;
	// Credentials the request carries. They are removed from any failure text
	// before it is handed on, so no error message can show one.
	readonly secrets: ReadonlyArray<string>;
	readonly toError: (failure: WorkerFailure) => E;
}): Effect.Effect<Done, E> =>
	Effect.acquireUseRelease(
		Effect.sync(startWorker),
		(worker) =>
			Effect.callback<Done, E>((resume) => {
				worker.onmessage = (event: MessageEvent) => {
					const message = event.data;

					if (!isTagged(message) || message.id !== params.request.id) return;

					if (params.isDone(message)) {
						resume(Effect.succeed(message));

						return;
					}

					if (isFailureMessage(message)) {
						resume(
							Effect.fail(
								params.toError({
									reason: message.reason,
									detail: scrub(message.detail, params.secrets),
								}),
							),
						);
					}
				};

				worker.onerror = (event) => {
					resume(
						Effect.fail(
							params.toError({
								reason: "worker",
								detail: scrub(event.message, params.secrets),
							}),
						),
					);
				};

				worker.postMessage(params.request, [...params.transfer]);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
	);

// Words an engine-level failure. A tool wraps this for its own reasons.
export const engineError = (
	failure: WorkerFailure,
): PdfEngineLoadError | QpdfWorkerError =>
	failure.reason === "engine-load"
		? new PdfEngineLoadError({
				stage: "starting",
				message: m.error_qpdf_start(),
			})
		: new QpdfWorkerError({
				message: failure.detail ?? m.error_qpdf_worker(),
			});

const isRunDone = Schema.is(QpdfRunDone);

// The generic job: run qpdf command lines on files and get each command's exit code
// and text back. This is what a second tool (say a lossless compression pass) calls.
// The caller makes sure the engine is loaded first (loadQpdfEngine behind the
// consent gate); without it the worker tries the network and, offline, fails with
// PdfEngineLoadError.
//
// The exit codes and the stdout and stderr in the result are qpdf's own text, raw.
// Error messages are scrubbed of password flags, but a tool that shows stdout or
// stderr to a person is responsible for what is in it.
export const runQpdfJob = (params: {
	readonly inputs: ReadonlyArray<{
		readonly path: string;
		readonly bytes: ArrayBuffer;
	}>;
	readonly steps: ReadonlyArray<{ readonly args: ReadonlyArray<string> }>;
	readonly outputs: ReadonlyArray<string>;
}): Effect.Effect<QpdfRunResult, PdfEngineLoadError | QpdfWorkerError> =>
	Effect.gen(function* () {
		const request: QpdfRunRequest = {
			type: "qpdf-run",
			id: crypto.randomUUID(),
			wasmUrl: QPDF_WASM_URL,
			inputs: params.inputs,
			steps: params.steps,
			outputs: params.outputs,
		};

		const done = yield* runInWorker({
			request,
			transfer: params.inputs.map((file) => file.bytes),
			isDone: isRunDone,
			secrets: passwordsInArgs(params.steps),
			toError: engineError,
		});

		return {
			steps: done.steps,
			outputs: done.outputs.map((file) => ({
				path: file.path,
				bytes: new Uint8Array(file.bytes),
			})),
		};
	});

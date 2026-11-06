// Main-thread side of the converter. Short text converts right here. Long text
// goes to a worker, which is created per call and always ends.

import { Effect } from "effect";

import { m } from "#/paraglide/messages.js";

import {
	type ConvertError,
	ConverterWorkerError,
	InputTooLargeError,
	ParseError,
	NotATableError,
} from "./errors.ts";
import type {
	ConverterFailure,
	ConverterRequest,
	ConverterResponse,
} from "./protocol.ts";
import { type ConvertOptions, WORKER_MIN_CHARS } from "./types.ts";

// The `new URL(...)` must stay inline inside `new Worker(...)` so Vite bundles
// the worker. Hoisting it into a variable breaks the production build (see
// docs/image-worker-crashed-debugging.md).
const spawn = () =>
	new Worker(
		new URL("../../workers/json-converter.worker.ts", import.meta.url),
		{
			type: "module",
		},
	);

export type RunError = ConvertError | ConverterWorkerError;

const rebuild = (failure: ConverterFailure): RunError => {
	switch (failure.tag) {
		case "ParseError":
			return new ParseError(failure);
		case "NotATableError":
			return new NotATableError({ message: failure.message });
		case "InputTooLargeError":
			return new InputTooLargeError(failure);
		case "Defect":
			return new ConverterWorkerError({ message: m.jc_err_worker_stopped() });
	}
};

const inWorker = (
	text: string,
	options: ConvertOptions,
): Effect.Effect<string, RunError> =>
	Effect.acquireUseRelease(
		Effect.sync(spawn),
		(worker) =>
			Effect.callback<string, RunError>((resume) => {
				worker.onmessage = (event: MessageEvent<ConverterResponse>) => {
					const response = event.data;

					resume(
						response.ok
							? Effect.succeed(response.output)
							: Effect.fail(rebuild(response.failure)),
					);
				};

				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new ConverterWorkerError({
								message: event.message || m.jc_err_worker_stopped(),
							}),
						),
					);
				};

				worker.onmessageerror = () => {
					resume(
						Effect.fail(
							new ConverterWorkerError({
								message: m.jc_err_worker_stopped(),
							}),
						),
					);
				};

				const request: ConverterRequest = { text, options };

				worker.postMessage(request);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
	);

// Loaded on first use, so the YAML parser stays out of the page's own bundle.
const onThePage = (
	text: string,
	options: ConvertOptions,
): Effect.Effect<string, RunError> =>
	Effect.promise(() => import("./convert.ts")).pipe(
		Effect.flatMap(({ convert }) => convert(text, options)),
	);

/**
 * Converts `text`. Interrupting the effect ends the worker, so a stale run costs
 * nothing. A crash (no Worker support, a chunk that will not load offline) comes
 * back as a `ConverterWorkerError` so the page never keeps a stale result.
 */
export const runConversion = (
	text: string,
	options: ConvertOptions,
): Effect.Effect<string, RunError> =>
	(text.length < WORKER_MIN_CHARS
		? onThePage(text, options)
		: inWorker(text, options)
	).pipe(
		Effect.catchDefect(() =>
			Effect.fail(
				new ConverterWorkerError({ message: m.jc_err_worker_stopped() }),
			),
		),
	);

/// <reference lib="webworker" />
// Converts JSON, YAML and CSV off the main thread, so a 20 MB file does not
// freeze the page. Stateless: orchestration and typed errors live in
// src/lib/json-converter/client.ts.

import { Cause, Effect, Exit, Match, Option } from "effect";

import { convert } from "#/lib/json-converter/convert.ts";
import type { ConvertError } from "#/lib/json-converter/errors.ts";
import type {
	ConverterFailure,
	ConverterRequest,
	ConverterResponse,
} from "#/lib/json-converter/protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

// A tagged error does not survive postMessage as a class, so it goes as data.
const toFailure = (cause: Cause.Cause<ConvertError>): ConverterFailure => {
	const error = Option.getOrUndefined(Cause.findErrorOption(cause));

	if (!error) return { tag: "Defect" };

	return Match.value(error).pipe(
		Match.tagsExhaustive({
			ParseError: ({ message, format, line, column }): ConverterFailure => ({
				tag: "ParseError",
				message,
				format,
				line,
				column,
			}),
			UnsupportedShapeError: ({ message }): ConverterFailure => ({
				tag: "UnsupportedShapeError",
				message,
			}),
			InputTooLargeError: ({ message, size, limit }): ConverterFailure => ({
				tag: "InputTooLargeError",
				message,
				size,
				limit,
			}),
		}),
	);
};

self.onmessage = async (event: MessageEvent<ConverterRequest>) => {
	const { text, options } = event.data;
	const exit = await Effect.runPromiseExit(convert(text, options));

	const response: ConverterResponse = Exit.isSuccess(exit)
		? { ok: true, output: exit.value }
		: { ok: false, failure: toFailure(exit.cause) };

	self.postMessage(response);
};

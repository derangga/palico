import { Cause, Effect, Exit, Option, Predicate } from "effect";

import { convert } from "./convert.ts";
import type {
	ConvertError,
	ParseError,
	UnsupportedShapeError,
} from "./errors.ts";
import { messageTemplates } from "./texts.ts";
import type { ConvertOptions } from "./types.ts";

export const DEFAULTS: ConvertOptions = {
	source: "json",
	target: "json",
	indent: "2",
	sortKeys: false,
	guessTypes: false,
	inputDelimiter: ",",
	outputDelimiter: ",",
	texts: messageTemplates("en"),
};

export const run = (text: string, options: Partial<ConvertOptions>): string =>
	Effect.runSync(convert(text, { ...DEFAULTS, ...options }));

export const failure = (
	text: string,
	options: Partial<ConvertOptions>,
): ConvertError => {
	const exit = Effect.runSyncExit(convert(text, { ...DEFAULTS, ...options }));

	const error = Exit.isFailure(exit)
		? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
		: undefined;

	if (!error) throw new Error("should not convert");

	return error;
};

/** The failure for text that should not parse. Throws when it failed some other way. */
export const parseFailure = (
	text: string,
	options: Partial<ConvertOptions>,
): ParseError => {
	const error = failure(text, options);

	if (!Predicate.isTagged(error, "ParseError")) {
		throw new Error(`expected a ParseError, got ${error._tag}`);
	}

	return error;
};

/** The failure for data that should not become a table. */
export const shapeFailure = (
	text: string,
	options: Partial<ConvertOptions>,
): UnsupportedShapeError => {
	const error = failure(text, options);

	if (!Predicate.isTagged(error, "UnsupportedShapeError")) {
		throw new Error(`expected an UnsupportedShapeError, got ${error._tag}`);
	}

	return error;
};

// The whole conversion: read the source format, tidy, write the target format.
// Pure and Effect-based, so it runs the same on the page and in the worker.

import { Effect } from "effect";

import { csvToValue, stringifyCsv } from "./csv.ts";
import { InputTooLargeError, type ConvertError } from "./errors.ts";
import { parseJson, stringifyJson } from "./json.ts";
import { say } from "./say.ts";
import { toTable } from "./table.ts";
import {
	type ConvertOptions,
	type Format,
	type JsonValue,
	MAX_INPUT_CHARS,
	megabytes,
} from "./types.ts";
import { isRecord } from "./value.ts";
import { parseYaml, stringifyYaml } from "./yaml.ts";

const BOM = /^﻿/;

/** Puts every object's keys in order. Lists keep their order. */
export function sortKeys(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(sortKeys);

	if (isRecord(value)) {
		const sorted: Record<string, JsonValue> = Object.create(null);

		const entries = Object.entries(value).sort(([left], [right]) =>
			left < right ? -1 : left > right ? 1 : 0,
		);

		for (const [key, child] of entries) sorted[key] = sortKeys(child);

		return sorted;
	}

	return value;
}

const read = (
	text: string,
	format: Format,
	options: ConvertOptions,
): Effect.Effect<JsonValue, ConvertError> => {
	switch (format) {
		case "json":
			return parseJson(text, options.texts);
		case "yaml":
			return parseYaml(text, options.texts);
		case "csv":
			return csvToValue(text, {
				delimiter: options.inputDelimiter,
				guessTypes: options.guessTypes,
				texts: options.texts,
			});
	}
};

const write = (
	value: JsonValue,
	options: ConvertOptions,
): Effect.Effect<string, ConvertError> => {
	switch (options.target) {
		case "json":
			return Effect.sync(() => stringifyJson(value, options.indent));
		case "yaml":
			return Effect.sync(() => stringifyYaml(value));
		case "csv":
			return toTable(value, options.texts).pipe(
				Effect.map(({ headers, rows }) =>
					stringifyCsv(headers, rows, options.outputDelimiter),
				),
			);
	}
};

export const convert = (
	text: string,
	options: ConvertOptions,
): Effect.Effect<string, ConvertError> =>
	Effect.gen(function* () {
		if (text.length > MAX_INPUT_CHARS) {
			return yield* Effect.fail(
				new InputTooLargeError({
					size: text.length,
					limit: MAX_INPUT_CHARS,
					message: say(options.texts, "too_large", {
						size: megabytes(text.length),
						limit: megabytes(MAX_INPUT_CHARS),
					}),
				}),
			);
		}

		const clean = text.replace(BOM, "");

		if (clean.trim() === "") return "";

		const parsed = yield* read(clean, options.source, options);
		const value = options.sortKeys ? sortKeys(parsed) : parsed;

		return yield* write(value, options);
	});

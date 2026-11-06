import { Predicate } from "effect";

import type { JsonRecord } from "#/lib/json-converter/value.ts";

/** The value at `key` when it is a string. Anything else reads as missing. */
export const stringOf = (
	record: JsonRecord,
	key: string,
): string | undefined => {
	const value = record[key];

	return Predicate.isString(value) ? value : undefined;
};

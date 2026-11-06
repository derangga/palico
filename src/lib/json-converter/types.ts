import type { Texts } from "./say.ts";

export type Format = "json" | "yaml" | "csv";

export const FORMATS: ReadonlyArray<Format> = ["json", "yaml", "csv"];

export type Delimiter = "," | ";" | "\t";

export const DELIMITERS: ReadonlyArray<Delimiter> = [",", ";", "\t"];

export type JsonIndent = "2" | "4" | "tab" | "min";

export const INDENTS: ReadonlyArray<JsonIndent> = ["2", "4", "tab", "min"];

/**
 * What every format is read into and written from. `bigint` holds an integer
 * past `Number.MAX_SAFE_INTEGER`, so an ID is never rounded on the way through.
 */
export type JsonValue =
	| null
	| boolean
	| number
	| bigint
	| string
	| ReadonlyArray<JsonValue>
	| { readonly [key: string]: JsonValue };

export interface ConvertOptions {
	readonly source: Format;
	readonly target: Format;
	readonly indent: JsonIndent;
	readonly sortKeys: boolean;
	/** CSV input only. Off keeps every cell a string. */
	readonly guessTypes: boolean;
	/** CSV input only. */
	readonly inputDelimiter: Delimiter;
	/** CSV output only. */
	readonly outputDelimiter: Delimiter;
	/** Error messages in the active language. A worker has no locale of its own. */
	readonly texts: Texts;
}

/** Text longer than this is refused. About 25 MB of UTF-16 text. */
export const MAX_INPUT_CHARS = 25_000_000;

/** Inputs shorter than this convert on the page. Longer ones go to a worker. */
export const WORKER_MIN_CHARS = 200_000;

/** A size in characters or bytes as megabytes to one decimal, for the size messages. */
export const megabytes = (count: number): number =>
	Math.round(count / 100_000) / 10;

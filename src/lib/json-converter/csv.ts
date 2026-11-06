// A CSV reader and writer. Handles quoted cells with commas, doubled quotes and
// line breaks, CRLF and LF, and blank lines. About as small as it can be.

import { Effect } from "effect";

import { ParseError } from "./errors.ts";
import { positionAt } from "./position.ts";
import { say, type Texts } from "./say.ts";
import { DELIMITERS, type Delimiter, type JsonValue } from "./types.ts";

const QUOTE = 34;
const LF = 10;
const CR = 13;

/** Picks the delimiter that appears most on the first line, outside quotes. Comma wins a tie. */
export function detectDelimiter(text: string): Delimiter {
	const counts = new Map<Delimiter, number>(DELIMITERS.map((d) => [d, 0]));
	let quoted = false;

	for (let at = 0; at < Math.min(text.length, 10_000); at++) {
		const char = text.charAt(at);
		const found = DELIMITERS.find((delimiter) => delimiter === char);

		if (char === '"') quoted = !quoted;
		else if (!quoted && (char === "\n" || char === "\r")) break;
		else if (!quoted && found !== undefined) {
			counts.set(found, (counts.get(found) ?? 0) + 1);
		}
	}

	let best: Delimiter = ",";

	for (const delimiter of DELIMITERS) {
		if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0))
			best = delimiter;
	}

	return best;
}

export interface CsvRows {
	readonly rows: ReadonlyArray<ReadonlyArray<string>>;
	/** The character offset where each row starts, for error messages. */
	readonly starts: ReadonlyArray<number>;
}

class CsvFailure extends Error {
	constructor(
		readonly offset: number,
		readonly reason: "unterminated" | "after_quote",
	) {
		super(reason);
	}
}

function readRows(text: string, delimiter: Delimiter): CsvRows {
	const rows: Array<Array<string>> = [];
	const starts: Array<number> = [];
	const delimiterCode = delimiter.charCodeAt(0);

	const run = new RegExp(
		`[^\\n\\r"${delimiter === "\t" ? "\\t" : delimiter}]+`,
		"y",
	);

	let row: Array<string> = [];
	let field = "";
	let at = 0;
	let rowStart = 0;
	let fieldStart = true;
	let quoted = false;

	const endRow = () => {
		row.push(field);

		// A line with nothing on it is not a row. A quoted "" is a cell.
		if (!(row.length === 1 && row[0] === "" && !quoted)) {
			rows.push(row);
			starts.push(rowStart);
		}

		row = [];
		field = "";
		fieldStart = true;
		quoted = false;
	};

	while (at < text.length) {
		const code = text.charCodeAt(at);

		if (fieldStart && code === QUOTE) {
			const open = at;

			at++;

			for (;;) {
				const close = text.indexOf('"', at);

				if (close < 0) throw new CsvFailure(open, "unterminated");

				field += text.slice(at, close);

				if (text.charCodeAt(close + 1) === QUOTE) {
					field += '"';
					at = close + 2;
				} else {
					at = close + 1;
					break;
				}
			}

			fieldStart = false;
			quoted = true;

			// Only a delimiter, a line break or the end may follow a closing quote.
			const after = text.charCodeAt(at);

			if (
				at < text.length &&
				after !== delimiterCode &&
				after !== LF &&
				after !== CR
			) {
				throw new CsvFailure(at, "after_quote");
			}
		} else if (code === delimiterCode) {
			row.push(field);
			field = "";
			fieldStart = true;
			at++;
		} else if (code === LF || code === CR) {
			endRow();

			at += code === CR && text.charCodeAt(at + 1) === LF ? 2 : 1;
			rowStart = at;
		} else {
			run.lastIndex = at;

			if (run.test(text)) {
				field += text.slice(at, run.lastIndex);
				at = run.lastIndex;
			} else {
				// A quote in the middle of a cell is just a character.
				field += text[at];
				at++;
			}

			fieldStart = false;
		}
	}

	if (!fieldStart || row.length > 0 || field !== "") endRow();

	return { rows, starts };
}

/** Splits CSV text into rows of cells. */
export const parseCsvRows = (
	text: string,
	delimiter: Delimiter,
	texts: Texts,
): Effect.Effect<CsvRows, ParseError> =>
	Effect.try({
		try: () => readRows(text, delimiter),
		catch: (cause) =>
			new ParseError({
				format: "csv",
				...positionAt(text, cause instanceof CsvFailure ? cause.offset : 0),
				message: say(
					texts,
					cause instanceof CsvFailure && cause.reason === "after_quote"
						? "csv_after_quote"
						: "csv_unterminated",
				),
			}),
	});

const NUMBER_CELL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Reads a cell as a number, boolean or null when it looks like one. Anything
 * else stays text. So do values that would lose something: `007` (leading
 * zeros) and integers past 2^53.
 */
export function guessCell(cell: string): JsonValue {
	if (cell === "true" || cell === "TRUE") return true;

	if (cell === "false" || cell === "FALSE") return false;

	if (cell === "null") return null;

	// Only a cell that writes the number the way JavaScript would. 1.10, 1e5,
	// -0 and integers past 2^53 would change, so they stay text.
	if (NUMBER_CELL.test(cell) && String(Number(cell)) === cell) {
		return Number(cell);
	}

	return cell;
}

/** Turns the first row into field names, keeping each one unique and non-empty. */
function headerNames(row: ReadonlyArray<string>): Array<string> {
	const used = new Set<string>();

	return row.map((raw, at) => {
		const base = raw.trim() === "" ? `column_${at + 1}` : raw;
		let name = base;

		for (let suffix = 2; used.has(name); suffix++) name = `${base}_${suffix}`;

		used.add(name);

		return name;
	});
}

/** Reads CSV into a list of objects, one per row, keyed by the header row. */
export const csvToValue = (
	text: string,
	options: {
		readonly delimiter: Delimiter;
		readonly guessTypes: boolean;
		readonly texts: Texts;
	},
): Effect.Effect<JsonValue, ParseError> =>
	Effect.gen(function* () {
		const { rows, starts } = yield* parseCsvRows(
			text,
			options.delimiter,
			options.texts,
		);

		const [first, ...body] = rows;

		if (!first) return [];

		const names = headerNames(first);
		const items: Array<JsonValue> = [];

		for (const [index, cells] of body.entries()) {
			if (cells.length > names.length) {
				return yield* Effect.fail(
					new ParseError({
						format: "csv",
						...positionAt(text, starts[index + 1] ?? 0),
						message: say(options.texts, "csv_ragged", {
							count: cells.length,
							expected: names.length,
						}),
					}),
				);
			}

			const item: Record<string, JsonValue> = Object.create(null);

			names.forEach((name, at) => {
				const cell = cells[at] ?? "";

				item[name] = options.guessTypes ? guessCell(cell) : cell;
			});

			items.push(item);
		}

		return items;
	});

const needsQuotes = (cell: string, delimiter: Delimiter) =>
	cell.includes('"') ||
	cell.includes("\n") ||
	cell.includes("\r") ||
	cell.includes(delimiter);

const quoteCell = (cell: string, delimiter: Delimiter) =>
	needsQuotes(cell, delimiter) ? `"${cell.replaceAll('"', '""')}"` : cell;

/** Writes a header row and rows as CSV, one line per row. */
export function stringifyCsv(
	headers: ReadonlyArray<string>,
	rows: ReadonlyArray<ReadonlyArray<string>>,
	delimiter: Delimiter,
): string {
	if (headers.length === 0) return "";

	const line = (cells: ReadonlyArray<string>) =>
		cells.map((cell) => quoteCell(cell, delimiter)).join(delimiter);

	return [line(headers), ...rows.map(line)].join("\n");
}

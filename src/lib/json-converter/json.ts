// A JSON reader and writer of our own. `JSON.parse` words its errors differently
// in every browser, has no line and column, and rounds integers past 2^53. This
// one reports where it failed and keeps those integers as `bigint`.

import { Effect, Predicate } from "effect";

import { ParseError } from "./errors.ts";
import { positionAt } from "./position.ts";
import { say, type TextKey, type Texts } from "./say.ts";
import type { JsonIndent, JsonValue } from "./types.ts";
import { isRecord, type JsonRecord } from "./value.ts";

type Reason =
	| "unexpected_char"
	| "unexpected_end"
	| "single_quote"
	| "comment"
	| "trailing_comma"
	| "bad_escape"
	| "control_char"
	| "bad_number"
	| "trailing_data"
	| "too_deep";

class JsonFailure extends Error {
	constructor(
		readonly offset: number,
		readonly reason: Reason,
		readonly char: string,
	) {
		super(reason);
	}
}

// Deeper than any real document, shallow enough that the recursion cannot blow the stack.
const MAX_DEPTH = 512;

const NUMBER = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;

// JSON forbids raw control characters inside a string, so the run of plain text stops at one.
// oxlint-disable-next-line no-control-regex
const PLAIN = /[^"\\\u0000-\u001f]+/y;
const SPACE = /[ \t\n\r]*/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

const ESCAPES = new Map([
	['"', '"'],
	["\\", "\\"],
	["/", "/"],
	["b", "\b"],
	["f", "\f"],
	["n", "\n"],
	["r", "\r"],
	["t", "\t"],
]);

function readJson(text: string): JsonValue {
	const length = text.length;
	let at = 0;

	const fail = (reason: Reason, offset = at, char = ""): never => {
		throw new JsonFailure(offset, reason, char);
	};

	const unexpected = (): never => {
		if (at >= length) return fail("unexpected_end");

		const char = String.fromCodePoint(text.codePointAt(at) ?? 0);

		if (char === "'") return fail("single_quote");

		if (char === "/") return fail("comment");

		return fail("unexpected_char", at, char);
	};

	const skip = () => {
		SPACE.lastIndex = at;
		SPACE.test(text);
		at = SPACE.lastIndex;
	};

	const readString = (): string => {
		at++;

		let out = "";

		for (;;) {
			PLAIN.lastIndex = at;

			if (PLAIN.test(text)) {
				out += text.slice(at, PLAIN.lastIndex);
				at = PLAIN.lastIndex;
			}

			if (at >= length) return fail("unexpected_end");

			const char = text[at];

			if (char === '"') {
				at++;

				return out;
			}

			if (char !== "\\") return fail("control_char");

			const next = text[at + 1];

			if (next === "u") {
				const hex = text.slice(at + 2, at + 6);

				if (!HEX4.test(hex)) return fail("bad_escape");

				out += String.fromCharCode(Number.parseInt(hex, 16));
				at += 6;
			} else {
				const escaped = ESCAPES.get(next ?? "");

				if (escaped === undefined) return fail("bad_escape");

				out += escaped;
				at += 2;
			}
		}
	};

	const readNumber = (): number | bigint => {
		NUMBER.lastIndex = at;

		const found = NUMBER.exec(text);

		if (!found) return fail("bad_number");

		const digits = found[0];

		at += digits.length;

		const isInteger = found[1] === undefined && found[2] === undefined;
		const number = Number(digits);

		return isInteger && !Number.isSafeInteger(number) ? BigInt(digits) : number;
	};

	const readLiteral = <T>(word: string, value: T): T => {
		if (!text.startsWith(word, at)) return unexpected();

		at += word.length;

		return value;
	};

	const readValue = (depth: number): JsonValue => {
		skip();

		const char = text[at];

		if (char === "{") return readObject(depth);

		if (char === "[") return readArray(depth);

		if (char === '"') return readString();

		if (char === "t") return readLiteral("true", true);

		if (char === "f") return readLiteral("false", false);

		if (char === "n") return readLiteral("null", null);

		if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) {
			return readNumber();
		}

		return unexpected();
	};

	const readObject = (depth: number): JsonValue => {
		if (depth > MAX_DEPTH) return fail("too_deep");

		at++;

		// No prototype, so a "__proto__" key is data and not a setter.
		const object: Record<string, JsonValue> = Object.create(null);

		skip();

		if (text[at] === "}") {
			at++;

			return object;
		}

		for (;;) {
			skip();

			if (text[at] !== '"') return unexpected();

			const key = readString();

			skip();

			if (text[at] !== ":") return unexpected();

			at++;
			object[key] = readValue(depth + 1);
			skip();

			if (text[at] === ",") {
				at++;
				skip();

				if (text[at] === "}") return fail("trailing_comma");

				continue;
			}

			if (text[at] === "}") {
				at++;

				return object;
			}

			return unexpected();
		}
	};

	const readArray = (depth: number): JsonValue => {
		if (depth > MAX_DEPTH) return fail("too_deep");

		at++;

		const items: Array<JsonValue> = [];

		skip();

		if (text[at] === "]") {
			at++;

			return items;
		}

		for (;;) {
			items.push(readValue(depth + 1));
			skip();

			if (text[at] === ",") {
				at++;
				skip();

				if (text[at] === "]") return fail("trailing_comma");

				continue;
			}

			if (text[at] === "]") {
				at++;

				return items;
			}

			return unexpected();
		}
	};

	const value = readValue(0);

	skip();

	if (at < length) return fail("trailing_data");

	return value;
}

const REASON_KEYS = {
	unexpected_char: "json_unexpected_char",
	unexpected_end: "json_unexpected_end",
	single_quote: "json_single_quote",
	comment: "json_comment",
	trailing_comma: "json_trailing_comma",
	bad_escape: "json_bad_escape",
	control_char: "json_control_char",
	bad_number: "json_bad_number",
	trailing_data: "json_trailing_data",
	too_deep: "json_too_deep",
} as const satisfies Record<Reason, TextKey>;

const reasonText = (failure: JsonFailure, texts: Texts): string =>
	say(texts, REASON_KEYS[failure.reason], { char: failure.char });

/** Reads JSON text. Fails with the line and column of the first fault. */
export const parseJson = (
	text: string,
	texts: Texts,
): Effect.Effect<JsonValue, ParseError> =>
	Effect.try({
		try: () => readJson(text),
		catch: (cause) => {
			if (cause instanceof JsonFailure) {
				return new ParseError({
					format: "json",
					...positionAt(text, cause.offset),
					message: reasonText(cause, texts),
				});
			}

			// A stack overflow on pathological nesting is the only other way in.
			return new ParseError({
				format: "json",
				line: 1,
				column: 1,
				message: say(texts, "json_too_deep"),
			});
		},
	});

const INDENT_UNIT: Record<JsonIndent, string> = {
	"2": "  ",
	"4": "    ",
	tab: "\t",
	min: "",
};

/** Writes JSON. Unlike `JSON.stringify` it writes a `bigint` as a plain number. */
export function stringifyJson(value: JsonValue, indent: JsonIndent): string {
	const unit = INDENT_UNIT[indent];
	const pretty = indent !== "min";
	const parts: Array<string> = [];

	const write = (node: JsonValue, level: string) => {
		if (Predicate.isNull(node)) {
			parts.push("null");
		} else if (Predicate.isString(node)) {
			parts.push(JSON.stringify(node));
		} else if (Predicate.isNumber(node)) {
			parts.push(Number.isFinite(node) ? String(node) : "null");
		} else if (Predicate.isBigInt(node)) {
			parts.push(node.toString());
		} else if (Predicate.isBoolean(node)) {
			parts.push(node ? "true" : "false");
		} else if (isRecord(node)) {
			writeObject(node, level);
		} else {
			writeArray(node, level);
		}
	};

	const writeArray = (items: ReadonlyArray<JsonValue>, level: string) => {
		if (items.length === 0) return void parts.push("[]");

		const inner = level + unit;

		parts.push("[");

		items.forEach((item, at) => {
			if (at > 0) parts.push(",");

			if (pretty) parts.push(`\n${inner}`);
			write(item, inner);
		});

		parts.push(pretty ? `\n${level}]` : "]");
	};

	const writeObject = (object: JsonRecord, level: string) => {
		const entries = Object.entries(object);

		if (entries.length === 0) return void parts.push("{}");

		const inner = level + unit;

		parts.push("{");

		entries.forEach(([key, child], at) => {
			if (at > 0) parts.push(",");

			if (pretty) parts.push(`\n${inner}`);
			parts.push(JSON.stringify(key), pretty ? ": " : ":");
			write(child, inner);
		});

		parts.push(pretty ? `\n${level}}` : "}");
	};

	write(value, "");

	return parts.join("");
}

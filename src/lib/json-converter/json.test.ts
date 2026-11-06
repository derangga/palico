import { describe, expect, it } from "vitest";

import {
	failure,
	parseFailure as parseFailureWith,
	run,
} from "./test-helpers.ts";
import { messageTemplates } from "./texts.ts";

const parseFailure = (text: string) => parseFailureWith(text, {});

describe("JSON in and out", () => {
	it("formats with two spaces by default", () => {
		expect(run('{"a":[1,2],"b":{"c":null}}', {})).toBe(
			'{\n  "a": [\n    1,\n    2\n  ],\n  "b": {\n    "c": null\n  }\n}',
		);
	});

	it("writes four spaces, tabs and minified", () => {
		const text = '{"a":[1]}';

		expect(run(text, { indent: "4" })).toBe(
			'{\n    "a": [\n        1\n    ]\n}',
		);
		expect(run(text, { indent: "tab" })).toBe('{\n\t"a": [\n\t\t1\n\t]\n}');
		expect(run('{ "a" : [ 1 , 2 ] }', { indent: "min" })).toBe('{"a":[1,2]}');
	});

	it("keeps empty arrays and objects on one line", () => {
		expect(run('{"a":[],"b":{}}', {})).toBe('{\n  "a": [],\n  "b": {}\n}');
	});

	it("keeps null, booleans, unicode and escapes", () => {
		const text =
			'{"s":"héllo \\u00e9 日本 \\n \\"q\\"","t":true,"f":false,"n":null}';

		const out = run(text, { indent: "min" });

		expect(JSON.parse(out)).toEqual(JSON.parse(text));
	});

	it("keeps integers past 2^53 exact", () => {
		const out = run('{"id":12345678901234567890,"safe":9007199254740991}', {
			indent: "min",
		});

		expect(out).toBe('{"id":12345678901234567890,"safe":9007199254740991}');
	});

	it("reads a __proto__ key as data", () => {
		expect(run('{"__proto__":1}', { indent: "min" })).toBe('{"__proto__":1}');
	});

	it("drops a byte order mark at the start", () => {
		expect(run('\uFEFF{"a":1}', { indent: "min" })).toBe('{"a":1}');
	});

	it("returns nothing for blank input", () => {
		expect(run("  \n ", {})).toBe("");
	});

	it("sorts keys at every depth and leaves lists in order", () => {
		expect(
			run('{"b":1,"a":{"d":[{"z":1,"y":2}],"c":2}}', {
				sortKeys: true,
				indent: "min",
			}),
		).toBe('{"a":{"c":2,"d":[{"y":2,"z":1}]},"b":1}');
	});
});

describe("JSON errors", () => {
	it("points at the line and column of the fault", () => {
		const error = parseFailure('{\n  "a": 1,\n  "b": oops\n}');

		expect(error._tag).toBe("ParseError");
		expect(error.line).toBe(3);
		expect(error.column).toBe(8);
		expect(error.format).toBe("json");
	});

	it("explains the usual mistakes", () => {
		expect(parseFailure("{'a': 1}").message).toMatch(/double quotes/);
		expect(parseFailure('{"a": 1, // note\n}').message).toMatch(/comments/);
		expect(parseFailure('{"a": 1,}').message).toMatch(/comma/);
		expect(parseFailure("[1, 2,]").message).toMatch(/comma/);
		expect(parseFailure('{"a": 1').message).toMatch(/ends too early/);
		expect(parseFailure('{"a": 1} x').message).toMatch(/extra text/);
		expect(parseFailure('["a\nb"]').message).toMatch(/line break/);
		expect(parseFailure('["\\q"]').message).toMatch(/escape/);
		expect(parseFailure("[-]").message).toMatch(/number/);
		expect(parseFailure("[01]").line).toBe(1);
	});

	it("reports the end of the text for an unterminated string", () => {
		const error = parseFailure('["abc');

		expect(error.line).toBe(1);
		expect(error.message).toMatch(/ends too early/);
	});

	it("refuses nesting deeper than it can read", () => {
		const error = parseFailure("[".repeat(2000));

		expect(error.message).toMatch(/nested too deeply/);
	});

	it("words the error in the requested language", () => {
		const error = failure("{'a':1}", { texts: messageTemplates("id") });

		expect(error.message).toMatch(/kutip ganda/);
	});
});

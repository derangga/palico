import { describe, expect, it } from "vitest";

import { detectDelimiter, guessCell } from "./csv.ts";
import { failure, parseFailure, run, shapeFailure } from "./test-helpers.ts";

const toJson = (csv: string, extra = {}) =>
	JSON.parse(
		run(csv, { source: "csv", target: "json", indent: "min", ...extra }),
	);

describe("CSV to JSON", () => {
	it("reads the first row as headers and keeps every cell a string", () => {
		expect(toJson("id,name\n1,Mika\n2,Sari\n")).toEqual([
			{ id: "1", name: "Mika" },
			{ id: "2", name: "Sari" },
		]);
	});

	it("reads quoted cells with commas, quotes and line breaks", () => {
		const csv = 'name,note\n"Tanaka, Mika","said ""hi"""\nSari,"two\nlines"\n';

		expect(toJson(csv)).toEqual([
			{ name: "Tanaka, Mika", note: 'said "hi"' },
			{ name: "Sari", note: "two\nlines" },
		]);
	});

	it("reads CRLF, a missing final newline and blank lines", () => {
		expect(toJson("a,b\r\n1,2\r\n\r\n3,4")).toEqual([
			{ a: "1", b: "2" },
			{ a: "3", b: "4" },
		]);
	});

	it("keeps unicode and a leading byte order mark out of the header", () => {
		expect(toJson("\uFEFFnama,kota\nBudi,Yogyakarta 日本\n")).toEqual([
			{ nama: "Budi", kota: "Yogyakarta 日本" },
		]);
	});

	it("fills short rows and names empty and repeated headers", () => {
		expect(toJson("a,,a\n1\n")).toEqual([{ a: "1", column_2: "", a_2: "" }]);
	});

	it("keeps every column when headers repeat, even after a generated name", () => {
		expect(toJson("a,a,a_2\n1,2,3\n")).toEqual([
			{ a: "1", a_2: "2", a_2_2: "3" },
		]);
	});

	it("keeps a quoted empty cell as a row but skips a blank line", () => {
		expect(toJson('a\n""\n\nx\n')).toEqual([{ a: "" }, { a: "x" }]);
	});

	it("refuses text after a closing quote", () => {
		const error = parseFailure('a,b\n"x"y,2', { source: "csv" });

		expect(error.line).toBe(2);
		expect(error.column).toBe(4);
		expect(error.message).toMatch(/closing quote/);
	});

	it("returns an empty list for a header with no rows", () => {
		expect(toJson("a,b\n")).toEqual([]);
	});

	it("reads semicolons and tabs", () => {
		expect(toJson("a;b\n1;2", { inputDelimiter: ";" })).toEqual([
			{ a: "1", b: "2" },
		]);
		expect(toJson("a\tb\n1\t2", { inputDelimiter: "\t" })).toEqual([
			{ a: "1", b: "2" },
		]);
	});

	it("guesses types only when asked", () => {
		const csv = "n,f,t,x,z,big\n42,1.5,true,null,007,12345678901234567890\n";

		expect(toJson(csv, { guessTypes: true })).toEqual([
			{
				n: 42,
				f: 1.5,
				t: true,
				x: null,
				z: "007",
				big: "12345678901234567890",
			},
		]);
		expect(toJson(csv)[0].n).toBe("42");
	});

	it("reports an unclosed quote where it opened", () => {
		const error = parseFailure('a,b\n1,"oops\n2,3', { source: "csv" });

		expect(error.format).toBe("csv");
		expect(error.line).toBe(2);
		expect(error.column).toBe(3);
	});

	it("reports a row with more cells than the header", () => {
		const error = parseFailure("a,b\n1,2\n3,4,5", { source: "csv" });

		expect(error.line).toBe(3);
		expect(error.message).toMatch(/3 cells/);
	});
});

describe("detectDelimiter", () => {
	it("picks the most common delimiter on the first line, outside quotes", () => {
		expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
		expect(detectDelimiter("a\tb\tc")).toBe("\t");
		expect(detectDelimiter('"a;b;c",d')).toBe(",");
		expect(detectDelimiter("plain")).toBe(",");
	});
});

describe("guessCell", () => {
	it("leaves text that merely looks numeric", () => {
		expect(guessCell("1e3")).toBe("1e3");
		expect(guessCell("1.10")).toBe("1.10");
		expect(guessCell("-0")).toBe("-0");
		expect(guessCell("-0.5")).toBe(-0.5);
		expect(guessCell("0x10")).toBe("0x10");
		expect(guessCell("1,000")).toBe("1,000");
		expect(guessCell("")).toBe("");
	});
});

describe("JSON to CSV", () => {
	const toCsv = (json: string, extra = {}) =>
		run(json, { source: "json", target: "csv", ...extra });

	it("writes one column per key and one row per object", () => {
		expect(toCsv('[{"id":1,"name":"Mika"},{"id":2,"name":"Sari"}]')).toBe(
			"id,name\n1,Mika\n2,Sari",
		);
	});

	it("flattens nested values with a dotted path", () => {
		expect(toCsv('[{"user":{"name":"Mika","tags":["a","b"]},"ok":true}]')).toBe(
			"user.name,user.tags.0,user.tags.1,ok\nMika,a,b,true",
		);
	});

	it("takes the union of keys and leaves gaps empty", () => {
		expect(toCsv('[{"a":1},{"b":2}]')).toBe("a,b\n1,\n,2");
	});

	it("writes null as empty and empty containers as [] and {}", () => {
		expect(toCsv('[{"n":null,"l":[],"o":{}}]')).toBe("n,l,o\n,[],{}");
	});

	it("quotes cells with the delimiter, quotes and line breaks", () => {
		expect(toCsv('[{"a":"x,y","b":"say \\"hi\\"","c":"1\\n2"}]')).toBe(
			'a,b,c\n"x,y","say ""hi""","1\n2"',
		);
	});

	it("writes big integers exactly", () => {
		expect(toCsv('[{"id":12345678901234567890}]')).toBe(
			"id\n12345678901234567890",
		);
	});

	it("uses the chosen delimiter", () => {
		expect(toCsv('[{"a":"x;y","b":1}]', { outputDelimiter: ";" })).toBe(
			'a;b\n"x;y";1',
		);
	});

	it("writes an empty list as nothing", () => {
		expect(toCsv("[]")).toBe("");
	});

	it("says why a top-level object cannot become a table", () => {
		const error = shapeFailure('{"a":1}', {
			source: "json",
			target: "csv",
		});

		expect(error._tag).toBe("UnsupportedShapeError");
		expect(error.message).toMatch(/list of objects/);
	});

	it("names the list inside an object that could become a table", () => {
		const error = failure('{"total":2,"users":[{"id":1}]}', {
			source: "json",
			target: "csv",
		});

		expect(error.message).toMatch(/"users"/);
	});

	it("says which item is not an object", () => {
		const error = failure('[{"a":1}, 5]', { source: "json", target: "csv" });

		expect(error._tag).toBe("UnsupportedShapeError");
		expect(error.message).toMatch(/Item 2/);
	});

	it("refuses two fields that flatten to one column", () => {
		const error = failure('[{"a.b":1,"a":{"b":2}}]', {
			source: "json",
			target: "csv",
		});

		expect(error.message).toMatch(/"a.b"/);
	});
});

import { describe, expect, it } from "vitest";

import { failure, parseFailure, run } from "./test-helpers.ts";

const toJson = (yaml: string) =>
	JSON.parse(run(yaml, { source: "yaml", target: "json", indent: "min" }));

const toYaml = (json: string) => run(json, { source: "json", target: "yaml" });

describe("YAML in", () => {
	it("reads maps, lists, scalars and comments", () => {
		expect(
			toJson(
				"# config\nname: palico\nport: 8080\nratio: 1.5\non: true\nnothing: null\ntags:\n  - a\n  - b\n",
			),
		).toEqual({
			name: "palico",
			port: 8080,
			ratio: 1.5,
			on: true,
			nothing: null,
			tags: ["a", "b"],
		});
	});

	it("reads multi-line strings and unicode", () => {
		expect(toJson("text: |\n  one\n  two\nname: 日本\n")).toEqual({
			text: "one\ntwo\n",
			name: "日本",
		});
	});

	it("keeps integers past 2^53 exact", () => {
		expect(
			run("id: 12345678901234567890", {
				source: "yaml",
				indent: "min",
			}),
		).toBe('{"id":12345678901234567890}');
	});

	it("reads a plain value as JSON and an empty document as nothing", () => {
		expect(run("hello", { source: "yaml", indent: "min" })).toBe('"hello"');
		expect(run("# only a comment", { source: "yaml" })).toBe("null");
	});

	it("reports the line and column of a syntax error", () => {
		const error = parseFailure("a: 1\nb: [1, 2\nc: 3\n", { source: "yaml" });

		expect(error._tag).toBe("ParseError");
		expect(error.format).toBe("yaml");
		expect(error.line).toBeGreaterThanOrEqual(2);
		expect(error.message).not.toMatch(/at line \d+/);
	});

	it("reports a duplicate key on its line", () => {
		const error = parseFailure("a: 1\na: 2\n", { source: "yaml" });

		expect(error.line).toBe(2);
	});

	it("refuses more than one document", () => {
		const error = failure("a: 1\n---\nb: 2\n", { source: "yaml" });

		expect(error.message).toMatch(/more than one/);
	});

	it("refuses anchors and aliases without running them", () => {
		const error = parseFailure("a: &x 1\nb: *x\n", { source: "yaml" });

		expect(error.message).toMatch(/Anchors and aliases/);
		expect(error.line).toBe(1);
	});

	it("refuses custom tags and tags that build objects", () => {
		expect(parseFailure("a: !custom 1\n", { source: "yaml" }).message).toMatch(
			/tag !custom/,
		);
		expect(failure("a: !!binary aGk=\n", { source: "yaml" }).message).toMatch(
			/tag !!binary/,
		);
		expect(failure("a: !!js/function 'x'\n", { source: "yaml" })._tag).toBe(
			"ParseError",
		);
	});

	it("allows the standard scalar tags", () => {
		expect(toJson("a: !!str 5\n")).toEqual({ a: "5" });
	});
});

describe("YAML out", () => {
	it("writes two-space indents", () => {
		expect(toYaml('{"a":{"b":[1,2]},"c":"x"}')).toBe(
			"a:\n  b:\n    - 1\n    - 2\nc: x\n",
		);
	});

	it("quotes strings that would read as something else", () => {
		const out = toYaml('{"a":"007","b":"true","c":"","d":null}');

		expect(out).toContain('a: "007"');
		expect(out).toContain('b: "true"');
		expect(out).toContain('c: ""');
		expect(out).toContain("d: null");
	});

	it("quotes words older YAML readers take for booleans", () => {
		expect(toYaml('{"a":"no","b":"On","c":"y","d":"nope"}')).toBe(
			'a: "no"\nb: "On"\nc: "y"\nd: nope\n',
		);
	});

	it("keeps empty containers and big integers", () => {
		expect(toYaml('{"a":[],"b":{},"id":12345678901234567890}')).toBe(
			"a: []\nb: {}\nid: 12345678901234567890\n",
		);
	});

	it("does not fold long lines", () => {
		const long = "word ".repeat(60).trim();

		expect(toYaml(JSON.stringify({ a: long }))).toBe(`a: ${long}\n`);
	});
});

import { describe, expect, it } from "vitest";

import { detectFormat, formatOfFileName } from "./detect.ts";

describe("detectFormat", () => {
	it("reads braces and brackets as JSON", () => {
		expect(detectFormat('{"a":1}')).toBe("json");
		expect(detectFormat("  \n[1,2]")).toBe("json");
		expect(detectFormat('\uFEFF{"a":1}')).toBe("json");
	});

	it("reads a lone number or quoted string as JSON", () => {
		expect(detectFormat("42")).toBe("json");
		expect(detectFormat('"hi"')).toBe("json");
	});

	it("reads key: value and list lines as YAML", () => {
		expect(detectFormat("name: palico\nport: 80")).toBe("yaml");
		expect(detectFormat("- a\n- b")).toBe("yaml");
		expect(detectFormat("---\na: 1")).toBe("yaml");
		expect(detectFormat("url: https://x.test, other")).toBe("yaml");
	});

	it("reads rows with the same delimiter on every line as CSV", () => {
		expect(detectFormat("id,name\n1,Mika\n2,Sari")).toBe("csv");
		expect(detectFormat("id;name\n1;Mika")).toBe("csv");
		expect(detectFormat("id\tname\n1\tMika")).toBe("csv");
		expect(detectFormat("id,name,age")).toBe("csv");
		expect(detectFormat("Name\tNote: x\nMika\thi")).toBe("csv");
	});

	it("falls back to YAML, which takes plain text", () => {
		expect(detectFormat("just some words")).toBe("yaml");
	});

	it("treats empty text as JSON", () => {
		expect(detectFormat("")).toBe("json");
	});
});

describe("formatOfFileName", () => {
	it("maps extensions and ignores case", () => {
		expect(formatOfFileName("data.JSON")).toBe("json");
		expect(formatOfFileName("a.yml")).toBe("yaml");
		expect(formatOfFileName("a.yaml")).toBe("yaml");
		expect(formatOfFileName("export.csv")).toBe("csv");
		expect(formatOfFileName("export.tsv")).toBe("csv");
	});

	it("says nothing for .txt and unknown names", () => {
		expect(formatOfFileName("notes.txt")).toBeUndefined();
		expect(formatOfFileName("noextension")).toBeUndefined();
	});
});

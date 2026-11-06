import { describe, expect, it } from "vitest";

import { InputTooLargeError } from "./errors.ts";
import { failure, run } from "./test-helpers.ts";
import { MAX_INPUT_CHARS } from "./types.ts";

const SAMPLE = [
	{ id: 1, name: "Mika", tags: ["a", "b"], ok: true, note: null },
	{ id: 2, name: "Sari, Jr.", tags: [], ok: false, note: "x\ny" },
];

const json = JSON.stringify(SAMPLE);

describe("round trips", () => {
	it("JSON to YAML to JSON", () => {
		const yaml = run(json, { source: "json", target: "yaml" });
		const back = run(yaml, { source: "yaml", target: "json", indent: "min" });

		expect(JSON.parse(back)).toEqual(SAMPLE);
	});

	it("JSON to CSV to JSON, with types guessed back", () => {
		const flat = [
			{ id: 1, name: "Sari, Jr.", ok: true, note: "x\ny", ratio: 1.5 },
			{ id: 2, name: "Mika", ok: false, note: "", ratio: 2 },
		];

		const csv = run(JSON.stringify(flat), { source: "json", target: "csv" });

		const back = run(csv, {
			source: "csv",
			target: "json",
			guessTypes: true,
			indent: "min",
		});

		expect(JSON.parse(back)).toEqual(flat);
	});

	it("CSV to JSON to CSV", () => {
		const csv = 'id,name\n1,"a, b"\n2,"line\nbreak"';
		const out = run(csv, { source: "csv", target: "json" });

		expect(run(out, { source: "json", target: "csv" })).toBe(csv);
	});

	it("YAML to CSV to YAML", () => {
		const yaml = "- id: 1\n  name: Mika\n- id: 2\n  name: Sari\n";
		const csv = run(yaml, { source: "yaml", target: "csv" });

		expect(csv).toBe("id,name\n1,Mika\n2,Sari");
		expect(run(csv, { source: "csv", target: "yaml", guessTypes: true })).toBe(
			yaml,
		);
	});

	it("keeps a big integer through JSON, YAML and back", () => {
		const text = '{"id":12345678901234567890}';
		const yaml = run(text, { source: "json", target: "yaml" });

		expect(yaml).toBe("id: 12345678901234567890\n");
		expect(run(yaml, { source: "yaml", target: "json", indent: "min" })).toBe(
			text,
		);
	});

	it("converts a file with a byte order mark and unicode", () => {
		const out = run('\uFEFF[{"nama":"日本","kota":"Jogja"}]', {
			source: "json",
			target: "csv",
		});

		expect(out).toBe("nama,kota\n日本,Jogja");
	});

	it("sorts keys before writing any format", () => {
		expect(
			run('[{"b":1,"a":2}]', {
				source: "json",
				target: "csv",
				sortKeys: true,
			}),
		).toBe("a,b\n2,1");
		expect(
			run('{"b":1,"a":2}', { source: "json", target: "yaml", sortKeys: true }),
		).toBe("a: 2\nb: 1\n");
	});
});

describe("limits", () => {
	it("refuses text past the limit with the size in the message", () => {
		const error = failure("x".repeat(MAX_INPUT_CHARS + 1), {});

		expect(error).toBeInstanceOf(InputTooLargeError);
		expect(error.message).toMatch(/limit is 25 MB/);
	});
});

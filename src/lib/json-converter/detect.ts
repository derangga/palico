import { detectDelimiter } from "./csv.ts";
import type { Format } from "./types.ts";

/** The format a file name points at. `.txt` and anything else say nothing. */
export function formatOfFileName(name: string): Format | undefined {
	const extension = name.toLowerCase().split(".").pop();

	switch (extension) {
		case "json":
			return "json";
		case "yaml":
		case "yml":
			return "yaml";
		case "csv":
		case "tsv":
			return "csv";
		default:
			return undefined;
	}
}

const YAMLISH = /^(?:---|-\s+\S|[^\s,;"'{[][^,;\t]*:(?:\s|$))/;

/**
 * Guesses the format from the first lines of the text. Braces and brackets mean
 * JSON, a `key: value` or `- item` line means YAML, and the same delimiter on
 * every one of the first lines means CSV. Anything else reads as YAML, which
 * accepts plain text.
 */
export function detectFormat(text: string): Format {
	const head = text.replace(/^﻿/, "").slice(0, 4000);
	const lines = head.split(/\r?\n/).filter((line) => line.trim() !== "");
	const first = lines[0]?.trim() ?? "";

	if (first === "") return "json";

	if (first.startsWith("{") || first.startsWith("[")) return "json";

	// A lone number or quoted string is a JSON document.
	if (
		lines.length === 1 &&
		(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(first) || /^".*"$/.test(first))
	) {
		return "json";
	}

	const delimiter = detectDelimiter(head);
	const count = (line: string) => line.split(delimiter).length;
	const sample = lines.slice(0, 5);

	const csvish =
		count(first) > 1 && sample.every((line) => count(line) === count(first));

	if (YAMLISH.test(first)) return "yaml";

	return csvish ? "csv" : "yaml";
}

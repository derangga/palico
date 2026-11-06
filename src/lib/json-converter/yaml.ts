// YAML in and out, on the `yaml` package's core schema (JSON-like types only).
// Anchors, aliases and tags that build objects are refused, not run.

import { Effect, Predicate } from "effect";
import {
	Document,
	isAlias,
	type Node,
	parseDocument,
	visit,
	type YAMLParseError,
} from "yaml";

import { ParseError } from "./errors.ts";
import { positionAt } from "./position.ts";
import { say, type Texts } from "./say.ts";
import type { JsonValue } from "./types.ts";
import { isRecord } from "./value.ts";

// The tags a plain YAML document can carry and still be plain data.
const PLAIN_TAGS = new Set(
	["str", "int", "float", "bool", "null", "map", "seq"].map(
		(name) => `tag:yaml.org,2002:${name}`,
	),
);

// `intAsBigInt` makes every integer a bigint. Bring the ones that fit back to numbers.
function toValue(node: JsonValue): JsonValue {
	if (Predicate.isBigInt(node)) {
		const number = Number(node);

		return Number.isSafeInteger(number) ? number : node;
	}

	if (Array.isArray(node)) return node.map(toValue);

	if (isRecord(node)) {
		const object: Record<string, JsonValue> = Object.create(null);

		for (const [key, value] of Object.entries(node))
			object[key] = toValue(value);

		return object;
	}

	return node;
}

// The library words its errors as "message at line 2, column 5:" plus a snippet.
const plainMessage = (error: YAMLParseError) =>
	error.message.split(/ at line \d+, column \d+/)[0] ?? error.message;

export const parseYaml = (
	text: string,
	texts: Texts,
): Effect.Effect<JsonValue, ParseError> =>
	Effect.suspend(() => {
		const document = parseDocument(text, {
			schema: "core",
			intAsBigInt: true,
			uniqueKeys: true,
		});

		const [error] = document.errors;

		if (error) {
			const [start] = error.linePos ?? [];

			return Effect.fail(
				new ParseError({
					format: "yaml",
					line: start?.line ?? 1,
					column: start?.col ?? 1,
					message:
						error.code === "MULTIPLE_DOCS"
							? say(texts, "yaml_multiple_documents")
							: say(texts, "yaml_syntax", { detail: plainMessage(error) }),
				}),
			);
		}

		let refused: ParseError | undefined;

		const refuse = (node: Node, message: string) => {
			refused ??= new ParseError({
				format: "yaml",
				...positionAt(text, node.range?.[0] ?? 0),
				message,
			});
		};

		visit(document, {
			Node: (_key, node) => {
				if (isAlias(node) || node.anchor) {
					refuse(node, say(texts, "yaml_anchor"));
				} else if (node.tag && !PLAIN_TAGS.has(node.tag)) {
					refuse(
						node,
						say(texts, "yaml_tag", {
							tag: node.tag.replace(/^tag:yaml\.org,2002:/, "!!"),
						}),
					);
				}
			},
		});

		return refused
			? Effect.fail(refused)
			: Effect.succeed(toValue(document.toJS()));
	});

// Words YAML 1.1 readers (PyYAML, Ruby) turn into booleans or null.
const YAML_11_WORD = /^(?:y|n|yes|no|on|off|true|false|null|~)$/i;

/**
 * Writes YAML with two-space indents and no line folding. Strings that an older
 * reader would take for a boolean (`no`, `on`) are quoted, so the file reads the
 * same everywhere.
 */
export const stringifyYaml = (value: JsonValue): string => {
	const document = new Document(value, { schema: "core" });

	visit(document, {
		Scalar: (_key, node) => {
			if (Predicate.isString(node.value) && YAML_11_WORD.test(node.value)) {
				node.type = "QUOTE_DOUBLE";
			}
		},
	});

	return document.toString({ lineWidth: 0, indent: 2 });
};

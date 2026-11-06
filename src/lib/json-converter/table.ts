// Turns a list of objects into a table: one column per path, nested values
// flattened with a dotted path (`user.name`, `tags.0`).

import { Effect, Predicate } from "effect";

import { NotATableError } from "./errors.ts";
import { say, type Texts } from "./say.ts";
import type { JsonValue } from "./types.ts";
import { isRecord, type JsonRecord } from "./value.ts";

export interface Table {
	readonly headers: ReadonlyArray<string>;
	readonly rows: ReadonlyArray<ReadonlyArray<string>>;
}

const cellText = (value: JsonValue): string => {
	if (value === null) return "";

	if (Predicate.isString(value)) return value;

	if (isRecord(value)) return "{}";

	if (Array.isArray(value)) return "[]";

	return String(value);
};

class Collision extends Error {
	constructor(readonly column: string) {
		super("collision");
	}
}

/** Walks one object into path/text pairs. Empty arrays and objects stay as `[]` and `{}`. */
function flatten(
	value: JsonValue,
	path: string,
	into: Map<string, string>,
): void {
	const entries: ReadonlyArray<readonly [string, JsonValue]> | undefined =
		Array.isArray(value)
			? value.map((item, at) => [String(at), item] as const)
			: isRecord(value)
				? Object.entries(value)
				: undefined;

	if (entries === undefined || entries.length === 0) {
		if (into.has(path)) throw new Collision(path);

		into.set(path, cellText(value));

		return;
	}

	for (const [key, child] of entries) {
		flatten(child, path === "" ? key : `${path}.${key}`, into);
	}
}

/** The first top-level key whose value is a non-empty list of objects. */
const listKey = (value: JsonRecord) =>
	Object.entries(value).find(
		([, item]) =>
			Array.isArray(item) &&
			item.length > 0 &&
			item.every((row) => isRecord(row)),
	)?.[0];

export const toTable = (
	value: JsonValue,
	texts: Texts,
): Effect.Effect<Table, NotATableError> =>
	Effect.gen(function* () {
		if (!Array.isArray(value)) {
			const key = isRecord(value) ? listKey(value) : undefined;

			return yield* Effect.fail(
				new NotATableError({
					message:
						key === undefined
							? say(texts, "table_not_list")
							: say(texts, "table_not_list_hint", { key }),
				}),
			);
		}

		const items: Array<JsonRecord> = [];

		for (const [at, item] of value.entries()) {
			if (!isRecord(item)) {
				return yield* Effect.fail(
					new NotATableError({
						message: say(texts, "table_item", { index: at + 1 }),
					}),
				);
			}

			items.push(item);
		}

		const headers = new Set<string>();
		const flat: Array<Map<string, string>> = [];

		try {
			for (const item of items) {
				const cells = new Map<string, string>();

				// An empty object has no columns, so it adds no cells.
				if (Object.keys(item).length > 0) flatten(item, "", cells);

				for (const header of cells.keys()) headers.add(header);

				flat.push(cells);
			}
		} catch (cause) {
			if (!(cause instanceof Collision)) throw cause;

			return yield* Effect.fail(
				new NotATableError({
					message: say(texts, "table_collision", { column: cause.column }),
				}),
			);
		}

		const columns = [...headers];

		return {
			headers: columns,
			rows: flat.map((cells) =>
				columns.map((column) => cells.get(column) ?? ""),
			),
		};
	});

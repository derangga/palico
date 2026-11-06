import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = `${root}messages/`;

const settings: { locales: Array<string> } = JSON.parse(
	readFileSync(`${root}project.inlang/settings.json`, "utf8"),
);

// Message key to text. Keys starting with "$" (the schema pointer) are not messages.
const load = (file: string): ReadonlyMap<string, string> =>
	new Map(
		Object.entries(JSON.parse(readFileSync(`${dir}${file}`, "utf8"))).flatMap(
			([key, text]) =>
				!key.startsWith("$") && typeof text === "string" ? [[key, text]] : [],
		),
	);

const params = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).toSorted();

const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
const base = load("en.json");

describe("message catalogs", () => {
	it("ships a catalog for every locale in project.inlang", () => {
		expect(files.toSorted()).toEqual(
			settings.locales.map((locale) => `${locale}.json`).toSorted(),
		);
	});

	for (const file of files.filter((f) => f !== "en.json")) {
		describe(file, () => {
			const catalog = load(file);

			it("has exactly the keys of en.json", () => {
				expect([...catalog.keys()].toSorted()).toEqual(
					[...base.keys()].toSorted(),
				);
			});

			it("uses the same parameters as en.json in every message", () => {
				for (const [key, text] of base) {
					expect(params(catalog.get(key) ?? ""), key).toEqual(params(text));
				}
			});

			it("leaves no message empty", () => {
				for (const [key, text] of catalog) {
					expect(text.trim(), key).not.toBe("");
				}
			});
		});
	}
});

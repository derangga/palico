import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
	DOCUMENT_ISOLATION_HEADERS,
	RESOURCE_POLICY_HEADER,
	RESOURCE_POLICY_PREFIXES,
	stampIsolationHeaders,
} from "./isolation-headers.ts";

// Parses Cloudflare's _headers format: an unindented path line followed by
// indented "Name: value" lines. Comments start with #.
const parseHeadersFile = (text: string): Map<string, Map<string, string>> => {
	const rules = new Map<string, Map<string, string>>();
	let current: Map<string, string> | undefined;

	for (const raw of text.split("\n")) {
		if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;

		if (!/^\s/.test(raw)) {
			current = new Map();
			rules.set(raw.trim(), current);
			continue;
		}

		const idx = raw.indexOf(":");
		current?.set(raw.slice(0, idx).trim(), raw.slice(idx + 1).trim());
	}

	return rules;
};

const rules = parseHeadersFile(readFileSync("public/_headers", "utf8"));

describe("public/_headers parity", () => {
	it("document rule matches DOCUMENT_ISOLATION_HEADERS", () => {
		const doc = rules.get("/*");

		for (const [name, value] of Object.entries(DOCUMENT_ISOLATION_HEADERS)) {
			expect(doc?.get(name)).toBe(value);
		}
	});

	it("each resource prefix has the CORP rule", () => {
		for (const prefix of RESOURCE_POLICY_PREFIXES) {
			const rule = rules.get(`${prefix}*`);
			expect(rule?.get(RESOURCE_POLICY_HEADER[0])).toBe(
				RESOURCE_POLICY_HEADER[1],
			);
		}
	});

	it("does not repeat COEP on resource rules (Cloudflare combines rules)", () => {
		for (const prefix of RESOURCE_POLICY_PREFIXES) {
			expect(rules.get(`${prefix}*`)?.has("Cross-Origin-Embedder-Policy")).toBe(
				false,
			);
		}
	});

	it("serves /sw.js uncached", () => {
		expect(rules.get("/sw.js")?.get("Cache-Control")).toBe("no-cache");
	});
});

describe("stampIsolationHeaders", () => {
	const stamp = (path: string, init?: ResponseInit) =>
		stampIsolationHeaders(
			new URL(path, "https://palico.test"),
			new Response("body", init),
		);

	it("adds COOP and COEP to a document response", async () => {
		const res = stamp("/pdf-split", {
			headers: { "content-type": "text/html" },
		});

		expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
		expect(res.headers.get("Cross-Origin-Embedder-Policy")).toBe(
			"require-corp",
		);
		expect(res.headers.get("content-type")).toBe("text/html");
		expect(await res.text()).toBe("body");
	});

	it("adds CORP only under /assets and /vendor", () => {
		expect(
			stamp("/assets/x.js").headers.get("Cross-Origin-Resource-Policy"),
		).toBe("same-origin");
		expect(
			stamp("/vendor/zetajs/zeta.js").headers.get(
				"Cross-Origin-Resource-Policy",
			),
		).toBe("same-origin");
		expect(stamp("/").headers.get("Cross-Origin-Resource-Policy")).toBeNull();
	});

	it("keeps status and overrides stale values", () => {
		const res = stamp("/", {
			status: 200,
			headers: { "Cross-Origin-Embedder-Policy": "unsafe-none" },
		});

		expect(res.status).toBe(200);
		expect(res.headers.get("Cross-Origin-Embedder-Policy")).toBe(
			"require-corp",
		);
	});
});

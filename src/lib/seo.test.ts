import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SITE_URL, seoHead } from "./seo.ts";
import { TOOLS } from "./tool-categories.ts";

describe("seo", () => {
	it("lists the home page and every tool in sitemap.xml", () => {
		const sitemap = readFileSync("public/sitemap.xml", "utf8");

		const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
			(m) => m[1],
		);

		expect(listed).toEqual(
			["/", ...TOOLS.map((t) => t.to)].map((p) => `${SITE_URL}${p}`),
		);
		expect(readFileSync("public/robots.txt", "utf8")).toContain(
			`Sitemap: ${SITE_URL}/sitemap.xml`,
		);
	});

	it("keeps titles and descriptions inside search result limits", () => {
		for (const tool of TOOLS) {
			expect(`${tool.seoTitle} | Palico`.length).toBeLessThanOrEqual(60);
			expect(tool.seoDescription.length).toBeLessThanOrEqual(160);
		}
	});

	it("gives each page its own canonical URL", () => {
		const canonical = (path: string) => seoHead(path).links[0]?.href;

		expect(canonical("/pdf-merge")).toBe(`${SITE_URL}/pdf-merge`);
		expect(canonical("/")).toBe(`${SITE_URL}/`);
	});
});

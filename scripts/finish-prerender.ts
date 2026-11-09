// Runs after `vite build` (see the "build" script). Two jobs:
//
// 1. Write dist/client/404.html. wrangler.deploy.jsonc serves it, with a 404
//    status, for any URL that is not a file. It is a copy of the SPA shell, so
//    the client still boots on it. See vite.config.ts and docs/seo.md.
// 2. Check that every page in sitemap.xml was prerendered with its own head, so a
//    page that falls back to Home's title or canonical URL fails the build instead
//    of reaching production.

import { copyFile, readdir, readFile } from "node:fs/promises";

const OUT_DIR = "dist/client";
const SITE_URL = "https://palico.rangga.site";

const fileOf = (path: string) => (path === "/" ? "index" : path.slice(1));

const sitemap = await readFile("public/sitemap.xml", "utf8");

const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
	new URL(m[1] ?? "").pathname,
);

const problems: Array<string> = [];

const titles = new Map<string, string>();

for (const path of paths) {
	const file = `${OUT_DIR}/${fileOf(path)}.html`;
	const html = await readFile(file, "utf8").catch(() => undefined);

	if (html === undefined) {
		problems.push(`${path}: ${file} was not written`);
		continue;
	}

	const title = html.match(/<title[^>]*>([^<]+)<\/title>/)?.[1];
	const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];

	if (!title) problems.push(`${path}: no <title>`);
	if (canonical !== `${SITE_URL}${path}`) {
		problems.push(`${path}: canonical is ${canonical ?? "missing"}`);
	}
	if (!html.includes('<meta name="description" content="')) {
		problems.push(`${path}: no meta description`);
	}
	if (!/<h1[\s>]/.test(html)) problems.push(`${path}: no <h1>`);

	// The WebSite and WebApplication data describes the whole app, so it belongs on
	// Home only (src/lib/seo.ts).
	if (html.includes("application/ld+json") !== (path === "/")) {
		problems.push(
			path === "/"
				? "/: structured data is missing"
				: `${path}: structured data belongs on Home only`,
		);
	}

	if (title) {
		const clash = titles.get(title);

		if (clash) problems.push(`${path}: same <title> as ${clash}`);
		titles.set(title, path);
	}
}

// A route that is not in the sitemap is prerendered but would go unchecked above.
const expected = new Set(paths.map((p) => `${fileOf(p)}.html`));
expected.add("_shell.html");
expected.add("404.html");

for (const name of await readdir(OUT_DIR)) {
	if (name.endsWith(".html") && !expected.has(name)) {
		problems.push(`${name}: prerendered but missing from public/sitemap.xml`);
	}
}

if (problems.length > 0) {
	console.error(`Prerender check failed:\n${problems.map((p) => `  ${p}`).join("\n")}`);
	process.exit(1);
}

await copyFile(`${OUT_DIR}/_shell.html`, `${OUT_DIR}/404.html`);

console.log(`prerender: ${paths.length} pages checked, 404.html written`);

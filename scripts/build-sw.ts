// Builds dist/client/sw.js: bundles src/sw.ts, then injects the precache manifest.
// Runs after `vite build` (see the "build" script). vite-plugin-pwa is not used: with
// TanStack Start + @cloudflare/vite-plugin it stores the SSR build's config
// (outDir dist/server, ssr=true) and skips generating the worker. injectManifest
// does not bundle imports, so we bundle first.

import { readFile } from "node:fs/promises";

import { build } from "vite";
import { injectManifest } from "workbox-build";

const OUT_DIR = "dist/client";
const SW = `${OUT_DIR}/sw.js`;

// Written by the palico-build-id plugin during `vite build`. The worker reports
// it so the page can tell whether a waiting worker matches the code it runs.
const BUILD_ID = (await readFile("dist/build-id", "utf8")).trim();

// Bundle with Vite itself (no extra dependency, honours the #/ alias). IIFE keeps
// the worker a classic script, which every browser accepts for registration.
await build({
	configFile: false,
	publicDir: false,
	logLevel: "warn",
	resolve: { tsconfigPaths: true },
	define: {
		"process.env.NODE_ENV": '"production"',
		__PALICO_BUILD_ID__: JSON.stringify(BUILD_ID),
	},
	build: {
		outDir: OUT_DIR,
		emptyOutDir: false,
		minify: true,
		lib: {
			entry: "src/sw.ts",
			formats: ["iife"],
			name: "palicoSw",
			fileName: () => "sw.js",
		},
	},
});

const { count, size, warnings } = await injectManifest({
	swSrc: SW,
	swDest: SW,
	globDirectory: OUT_DIR,
	// The app shell, every hashed asset, the home images and the vendored ZetaOffice
	// runtime (small, same-origin, needed by the opt-in Office engine). The
	// prerendered pages (index.html, pdf-merge.html, ...) stay out on purpose: a
	// precached page would be served before the network-first navigation route in
	// src/sw.ts, and a reload after a deploy would show the old build.
	globPatterns: [
		"_shell.html",
		"assets/**/*",
		"vendor/**/*",
		"palico-*.webp",
		"favicon*.{ico,png}",
		"apple-touch-icon.png",
		"site.webmanifest",
	],
	// The 21 MB ORT wasm is fetched on the consented model download, not at install.
	globIgnores: ["**/*.wasm", "**/*.map"],
	// Every file in assets/ has a content hash in its name. Skipping the cache-bust
	// lets the install reuse files the page already fetched into the HTTP cache
	// (served `immutable`, see public/_headers) instead of downloading them again.
	dontCacheBustURLsMatching: /^assets\//,
	maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
	// A page in the precache would be served before the navigation route, so fail the
	// build if a glob above starts to match one.
	manifestTransforms: [
		(entries) => {
			const pages = entries
				.map((e) => e.url)
				.filter((url) => url.endsWith(".html") && url !== "_shell.html");

			if (pages.length > 0) {
				throw new Error(`Pages must not be precached: ${pages.join(", ")}`);
			}

			return { manifest: entries, warnings: [] };
		},
	],
});

for (const w of warnings) console.warn(w);

console.log(
	`sw.js (build ${BUILD_ID}): precaching ${count} files, ${(size / 1024 / 1024).toFixed(1)} MB`,
);

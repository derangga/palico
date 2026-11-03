// Builds dist/client/sw.js: bundles src/sw.ts, then injects the precache manifest.
// Runs after `vite build` (see the "build" script). vite-plugin-pwa is not used: with
// TanStack Start + @cloudflare/vite-plugin it stores the SSR build's config
// (outDir dist/server, ssr=true) and skips generating the worker. injectManifest
// does not bundle imports, so we bundle first.

import { build } from "vite";
import { injectManifest } from "workbox-build";

const OUT_DIR = "dist/client";
const SW = `${OUT_DIR}/sw.js`;

// Bundle with Vite itself (no extra dependency, honours the #/ alias). IIFE keeps
// the worker a classic script, which every browser accepts for registration.
await build({
	configFile: false,
	publicDir: false,
	logLevel: "warn",
	resolve: { tsconfigPaths: true },
	define: { "process.env.NODE_ENV": '"production"' },
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
	// runtime (small, same-origin, needed by the opt-in Office engine).
	globPatterns: [
		"index.html",
		"assets/**/*",
		"vendor/**/*",
		"palico-*.webp",
		"favicon*",
		"apple-touch-icon.png",
		"site.webmanifest",
	],
	// The 21 MB ORT wasm is fetched on the consented model download, not at install.
	globIgnores: ["**/*.wasm", "**/*.map"],
	maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
});

for (const w of warnings) console.warn(w);

console.log(
	`sw.js: precaching ${count} files, ${(size / 1024 / 1024).toFixed(1)} MB`,
);

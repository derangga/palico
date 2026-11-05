import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { Connect, Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vite";

// The vendored ZetaOffice runtime (public/vendor/zetajs/*.js) must be served
// verbatim as ES modules: zetaHelper.js derives sibling script URLs from its own
// import.meta.url, and LibreOffice's pthread worker imports it at runtime. Vite's
// dev/preview server refuses to serve files under publicDir as JS modules (they're
// excluded from the module graph → 500 "Failed to load url"), so we intercept
// /vendor/** and stream it straight off disk with the right MIME + CORP header
// (so it loads under the site's COEP require-corp). In production the Cloudflare
// static-asset host serves these files directly, so this shim is dev/preview-only.
const serveVendorStatic = (): Plugin => {
	const middleware: Connect.NextHandleFunction = (req, res, next) => {
		const url = req.url?.split("?")[0];

		if (!url || !url.startsWith("/vendor/")) return next();
		const filePath = fileURLToPath(new URL(`./public${url}`, import.meta.url));
		readFile(filePath)
			.then((buf) => {
				res.setHeader("Content-Type", "text/javascript; charset=utf-8");
				res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
				res.end(buf);
			})
			.catch(() => next());
	};

	const attach = (server: ViteDevServer) => {
		// Unshift so this runs BEFORE Vite's transform middleware, which would
		// otherwise reject the publicDir import.
		server.middlewares.stack.unshift({ route: "", handle: middleware });
	};

	return {
		name: "serve-vendor-static",
		configureServer: attach,
		configurePreviewServer: (server) => {
			server.middlewares.use(middleware);
		},
	};
};

// One ID per build, compiled into the app as __PALICO_BUILD_ID__ and written to
// dist/build-id so scripts/build-sw.ts compiles the same value into sw.js. The
// page compares it with a waiting worker's ID: a match means the page already
// runs that build, so the worker can take over without an update prompt.
// Kept in process.env because one `vite build` loads this config more than once
// (the SPA prerender step loads it again), and every load must agree.
process.env.PALICO_BUILD_ID ??= Date.now().toString(36);
const BUILD_ID = process.env.PALICO_BUILD_ID;

const buildId = (): Plugin => ({
	name: "palico-build-id",
	config: () => ({
		define: { __PALICO_BUILD_ID__: JSON.stringify(BUILD_ID) },
	}),
	async writeBundle() {
		if (this.environment.name !== "client") return;
		await mkdir("dist", { recursive: true });
		await writeFile("dist/build-id", BUILD_ID);
	},
});

// COOP/COEP make the document cross-origin isolated so multi-threaded
// ffmpeg-core can use SharedArrayBuffer. src/server.ts sets these on the
// SSR/worker responses, but Vite's dev & preview middleware serves
// @ffmpeg/ffmpeg's own worker (worker.js?worker_file&type=module) directly —
// without these headers the nested pthreads workers can't spawn and
// ffmpeg.load() hangs on "Preparing tools". Mirror them here for dev/preview.
const crossOriginIsolation = {
	"Cross-Origin-Opener-Policy": "same-origin",
	"Cross-Origin-Embedder-Policy": "require-corp",
};

const config = defineConfig({
	resolve: { tsconfigPaths: true },
	server: { headers: crossOriginIsolation },
	preview: { headers: crossOriginIsolation },
	plugins: [
		serveVendorStatic(),
		buildId(),
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		// SPA mode: prerender a static shell instead of SSR. This app is
		// offline-first and renders everything client-side, so SSR only bloated
		// the Worker bundle past Cloudflare's 3 MiB limit with client-only libs
		// (transformers, mermaid, ffmpeg). The shell serves as a static asset.
		tanstackStart({
			spa: { enabled: true, prerender: { outputPath: "/index.html" } },
		}),
		viteReact(),
	],
});

export default config;

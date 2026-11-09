import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
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
		// Compiles messages/*.json into src/paraglide on dev start and build, and on
		// every change to them. The `i18n` script runs the same compile for typecheck
		// and tests. Only the base locale strategy: the active locale lives in
		// src/lib/i18n/state.ts, which overrides getLocale (see docs/i18n.md).
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			strategy: ["baseLocale"],
			disableAsyncLocalStorage: true,
		}),
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		// Production is static files: there is no rendering Worker, because SSR
		// bundled the client-only libs (transformers, mermaid, ffmpeg) past
		// Cloudflare's 3 MiB limit. Two things are prerendered at build time.
		//
		// - Every static route, as <route>.html (the router finds them all,
		//   so a new tool needs no entry here). Each page ships its own title,
		//   canonical URL, description and h1, so a crawler sees the right page
		//   before any JavaScript runs. See docs/seo.md.
		// - The SPA shell, as /_shell.html. It is a client-rendered fallback for
		//   what has no page of its own: the service worker serves it offline and
		//   public/404.html is built from it. It must not be /index.html, which is
		//   now the Home page.
		tanstackStart({
			spa: { enabled: true, prerender: { outputPath: "/_shell" } },
			prerender: {
				enabled: true,
				crawlLinks: true,
				failOnError: true,
				autoSubfolderIndex: false,
			},
			// The shell is rendered at "/" and the prerender queue skips a path it
			// has seen, so Home needs a different path to be rendered at all. The
			// query is ignored by the router; outputPath writes the file.
			pages: [
				{
					path: "/?home",
					prerender: { enabled: true, outputPath: "/index.html" },
				},
			],
		}),
		viteReact(),
	],
});

export default config;

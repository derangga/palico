import { readFile } from "node:fs/promises";
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
			server.middlewares.use((req, res, next) =>
				middleware(req as Connect.IncomingMessage, res, next),
			);
		},
	};
};

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
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;

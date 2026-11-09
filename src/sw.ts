/// <reference lib="webworker" />
// Service worker: precaches the built app so every route and non-engine tool loads
// offline, and keeps the page cross-origin isolated while offline.
//
// Scope is deliberately narrow:
// - Same-origin GET only. jsdelivr, cdn.zetaoffice.net and huggingface.co are never
//   touched here; engines stay in their page-managed Cache API buckets.
// - Every response served from the precache is re-stamped with COOP/COEP/CORP, so
//   isolation does not depend on what was stored (see isolation-headers.ts).
// - Navigations are network first, so a reload after a deploy gets the new build at
//   once. The precached shell is the fallback when offline or slow.
// - No skipWaiting on install. A new version waits until the page posts SKIP_WAITING
//   (the page does that without asking when it already runs this build).
//
// This file is thin Workbox glue with no Effect error channel; failures surface
// through the registration state in the page (src/lib/offline/register.ts).

import { clientsClaim, type WorkboxPlugin } from "workbox-core";
import {
	addPlugins,
	cleanupOutdatedCaches,
	createHandlerBoundToURL,
	precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";

import { ORT_CACHE_NAME } from "#/lib/offline/cache-names.ts";
import { stampIsolationHeaders } from "#/lib/offline/isolation-headers.ts";

declare const self: ServiceWorkerGlobalScope;

// Injected at build time by scripts/build-sw.ts (workbox-build injectManifest).
precacheAndRoute(self.__WB_MANIFEST);

cleanupOutdatedCaches();

const stampPlugin: WorkboxPlugin = {
	cachedResponseWillBeUsed: async ({ request, cachedResponse }) =>
		cachedResponse
			? stampIsolationHeaders(new URL(request.url), cachedResponse)
			: cachedResponse,
};

addPlugins([stampPlugin]);

// ONNX Runtime files for background removal are not precached (21 MB). The page
// stores them in ORT_CACHE_NAME on the consented download; this route serves them
// from there when offline (and falls back to the network otherwise).
registerRoute(
	({ url }) => url.pathname.startsWith("/assets/ort-wasm"),
	new CacheFirst({
		cacheName: ORT_CACHE_NAME,
		plugins: [stampPlugin],
	}),
);

// Navigations (deep link, reload) try the network first, so a reload after a
// deploy shows the new build without waiting for this worker's replacement to
// precache it. The new page's chunks are not precached here yet, so they go to
// the network too. Offline, a slow network or a server error get the precached
// SPA shell (/_shell.html, not a page of its own: see vite.config.ts). URLs that
// end in a file extension are excluded so a missing asset 404s instead of
// returning HTML with status 200.
const NETWORK_TIMEOUT_SECONDS = 3;

const network = new NetworkOnly({
	networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
});

const shell = createHandlerBoundToURL("/_shell.html");

registerRoute(
	new NavigationRoute(
		async (options) => {
			const response = await network.handle(options).catch(() => undefined);

			// A redirect (Cloudflare sends /pdf-merge/ to /pdf-merge) reaches a
			// navigation as an opaque response, so `ok` is false. Pass it on instead
			// of hiding it behind the shell.
			return response?.ok || response?.type === "opaqueredirect"
				? response
				: shell(options);
		},
		{ denylist: [/\/[^/?]+\.[^/]+$/] },
	),
);

// First install: take control of the open page so it works offline without a
// second load. Updates only reach this point after the user accepts (SKIP_WAITING).
clientsClaim();

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();

	// The page asks a waiting worker which build it holds (src/lib/offline/hosts.ts).
	if (event.data?.type === "GET_BUILD") {
		event.ports[0]?.postMessage(__PALICO_BUILD_ID__);
	}
});

// Navigation preload starts the page request while the worker boots, so network
// first adds almost no delay. NetworkOnly picks up event.preloadResponse itself.
self.addEventListener("activate", (event) => {
	event.waitUntil(
		self.registration.navigationPreload?.enable().catch(() => undefined) ??
			Promise.resolve(),
	);
});

// Kill switch: a bad release can be disabled by deploying
// public/sw-killswitch.json as { "disabled": true }. Checked on activation only;
// offline or failed fetches are ignored.
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const disabled = await fetch("/sw-killswitch.json", { cache: "no-store" })
				.then(async (r) => {
					const body: unknown = await r.json();

					return (
						body instanceof Object &&
						"disabled" in body &&
						body.disabled === true
					);
				})
				.catch(() => false);

			if (!disabled) return;
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((k) => k.includes("-precache-"))
					.map((k) => caches.delete(k)),
			);
			await self.registration.unregister();
		})(),
	);
});

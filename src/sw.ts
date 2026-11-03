/// <reference lib="webworker" />
// Service worker: precaches the built app so every route and non-engine tool loads
// offline, and keeps the page cross-origin isolated while offline.
//
// Scope is deliberately narrow:
// - Same-origin GET only. jsdelivr, cdn.zetaoffice.net and huggingface.co are never
//   touched here; engines stay in their page-managed Cache API buckets.
// - Every response served from the precache is re-stamped with COOP/COEP/CORP, so
//   isolation does not depend on what was stored (see isolation-headers.ts).
// - No skipWaiting on install. A new version waits until the page posts SKIP_WAITING.
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
import { CacheFirst } from "workbox-strategies";

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

// Any navigation (deep link, hard reload) gets the precached SPA shell. URLs that
// end in a file extension are excluded so a missing asset 404s instead of
// returning HTML with status 200.
registerRoute(
	new NavigationRoute(createHandlerBoundToURL("/index.html"), {
		denylist: [/\/[^/?]+\.[^/]+$/],
	}),
);

// First install: take control of the open page so it works offline without a
// second load. Updates only reach this point after the user accepts (SKIP_WAITING).
clientsClaim();

self.addEventListener("message", (event) => {
	if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

// Kill switch: a bad release can be disabled by deploying
// public/sw-killswitch.json as { "disabled": true }. Checked on activation only;
// offline or failed fetches are ignored.
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const disabled = await fetch("/sw-killswitch.json", { cache: "no-store" })
				.then((r) => r.json() as Promise<{ disabled?: boolean }>)
				.then((j) => j.disabled === true)
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

# Offline and install (PWA)

palico installs as an app and, after one online visit, runs every tool that does
not need a big engine without a connection. The big engines stay opt-in downloads.
This document explains how the pieces fit, why they are built this way, and how to
test them.

## Table of contents

1. [What works offline](#what-works-offline)
2. [Module map](#module-map)
3. [Service worker](#service-worker)
4. [Cross-origin isolation offline](#cross-origin-isolation-offline)
5. [Engines and the status pill](#engines-and-the-status-pill)
6. [Update flow](#update-flow)
7. [Storage and iOS](#storage-and-ios)
8. [Effect design](#effect-design)
9. [Testing](#testing)
10. [Problems we faced](#problems-we-faced)
11. [Known limits](#known-limits)
12. [File reference](#file-reference)

## What works offline

| Tier | What | How it is stored | Size |
| --- | --- | --- | --- |
| Precache | `index.html`, every hashed `/assets/**` except `*.wasm`, `/vendor/**`, home images, favicons, `site.webmanifest` | Workbox precache, written at install | about 19 MB on disk, about 5 MB over the wire |
| Opt-in, ffmpeg | core, wasm, worker | Cache API `ffmpeg-wasm-v<version>`, filled after consent | 31 MB |
| Opt-in, ZetaOffice | `soffice.js/.wasm/.data` | Cache API `zetaoffice-wasm-free`, filled after consent | 53 MB |
| Opt-in, background removal | RMBG-1.4 weights and ONNX Runtime | Cache API `palico-model-v1` (weights) and `palico-ort-v1` (ORT), filled after consent | about 200 MB |

Every route and the non-engine tools (image converter, resizer, compressor, PDF
tools, markdown, diff, favicon generator) work after the first visit. The video
tools, Word to PDF and background removal also need their engine saved.

## Module map

```
src/sw.ts                          service worker (thin Workbox glue, no Effect)
scripts/build-sw.ts                bundles sw.ts, injects the precache manifest
src/lib/offline/
  isolation-headers.ts             COOP/COEP/CORP table + stampIsolationHeaders (pure)
  register.ts                      startOffline: register, events, update poll, cleanup
  update.ts                        applyUpdate (SKIP_WAITING, reload once)
  busy.ts                          withBusy: marks long jobs as running
  gate.ts                          guardedEngineLoad: quota check + busy + verify
  storage.ts                       preflightDownload, afterDownload, stale cache cleanup
  engines.ts                       EngineSpec registry (isCached per engine)
  status.ts                        computeStatus (pure)
  hosts.ts / runtime.ts            ServiceWorkerHost, CacheHost, StorageHost + live layers
  state.ts / stores.ts             SubscriptionRefs and their React stores
  shapes.ts / errors.ts            Schema shapes and tagged errors
src/hooks/use-offline-status.ts    React hook over the above
src/components/offline/            OfflinePill, OfflineInfo (popover), UpdatePrompt
src/lib/image/model-cache.ts       Cache API storage for the background removal model
```

## Service worker

`bun run build` runs `vite build` and then `scripts/build-sw.ts`, which bundles
`src/sw.ts` to `dist/client/sw.js` with Vite and injects the file list with
`workbox-build`. The page registers it from `src/routes/__root.tsx` in production
builds only, after the window `load` event, so the 5 MB precache never competes with
first paint. Dev never registers a worker.

Why not `vite-plugin-pwa`: with TanStack Start and `@cloudflare/vite-plugin` it keeps
the SSR build's config (`ssr: true`, `outDir: dist/server`) and skips generating the
worker. We measured this; version 2.0.0 never emitted `sw.js`. Revisit if the plugin
gains per-environment support.

Behavior:

- `precacheAndRoute` plus a navigation route that serves the precached
  `/index.html` for every route, so deep links and hard reloads work offline. URLs
  ending in a file extension are excluded so a missing asset 404s instead of
  returning HTML.
- Same-origin GET only. jsdelivr, `cdn.zetaoffice.net` and huggingface.co are never
  intercepted.
- `/assets/ort-wasm*` is served cache-first from `palico-ort-v1`. The 21 MB wasm is not
  precached; the page stores it on the consented model download.
- `clientsClaim()` so the first visit is controlled without a second load.
- No `skipWaiting` on install. A new version waits for the page to post
  `SKIP_WAITING`.
- Kill switch: set `public/sw-killswitch.json` to `{ "disabled": true }` and deploy.
  On activation the worker deletes its precache and unregisters. For a worker that
  never activates, deploy a `sw.js` that calls `registration.unregister()`.
- `/sw.js` is served `Cache-Control: no-cache` (`public/_headers`).

An active worker means the install, and therefore the precache, finished. There is
no separate "precache complete" message.

## Cross-origin isolation offline

`public/_headers` puts COOP and COEP on every route and CORP on `/assets/*` and
`/vendor/*`. A response read from the Cache API keeps the headers it was stored with,
so the plain path works. To remove the dependence on what was stored, the worker
re-stamps the headers on every response it serves (`stampIsolationHeaders`). A
Vitest test parses `public/_headers` and fails if the two tables drift. Do not
repeat COEP on the `/assets/*` rule: Cloudflare combines matching rules and
`require-corp, require-corp` is invalid.

## Engines and the status pill

`ENGINES` in `engines.ts` gives the three `isCached` Effects one shape. A tool lists
its engine in `TOOLS` (`engine?: EngineId` in `src/lib/tool-categories.ts`).
`useOfflineStatus(engine)` combines the worker state with the engine check and
returns one of:

| Status | Meaning | Pill |
| --- | --- | --- |
| Ready | Works with no connection now | green, "Works offline" |
| Preparing | Worker installing or engine check running | working |
| NeedsDownload | Engine not saved yet | sapphire, "Needs a ~31 MB download" |
| NotSaved | Download finished but the browser did not keep it | yellow |
| Unavailable | No service worker support or it failed | neutral |

The status is recomputed from real cache contents after every download, so eviction
shows up. The tool header shows the full pill (click for an explanation, whether the
browser agreed to keep storage, and the iOS Home Screen hint). Home tiles and the
sidebar show a small dot and label for tools with an engine only, to keep tiles to one
saturated colour (`DESIGN.md`).

## Update flow

1. A new `sw.js` installs and waits. `startOffline` sees the waiting worker and sets
   the update state.
2. `UpdatePrompt` shows a toast, "A new version is ready". While any job is running
   (`withBusy` count above zero) the Update action is hidden and the toast says to wait.
3. On Update, `applyUpdate` arms the `controllerchange` listener, posts
   `SKIP_WAITING`, waits up to 5 seconds, and reloads once. Nothing reloads by itself.
4. Another tab that updated leaves this tab's lazy chunks missing. A
   `controllerchange` (when this tab had a controller) or a `vite:preloadError` shows
   "Reload to continue".

`withBusy` wraps the video convert, cut, compress, GIF and audio jobs, the Word to PDF
convert, background removal inference, and every engine download. It releases on
success, failure and interrupt. Converted-but-unsaved outputs do not count as busy; the
toast warns that unsaved files are lost on reload. Word to PDF converts a batch one
file at a time, so the count briefly returns to zero between files.

## Storage and iOS

- Before an engine download, `preflightDownload` compares free space from
  `navigator.storage.estimate()` with the engine size and fails with
  `StorageQuotaError` (shown on the consent card). If the browser gives no estimate the
  check is skipped.
- After a load, `afterDownload` re-runs `isCached`. If the bytes did not stick the tool
  shows NotSaved. Otherwise it calls `navigator.storage.persist()` once; a denial is
  just a value.
- On startup `cleanupStaleCaches` deletes engine buckets with an old name (a version
  bump used to leave 31 MB orphaned). It only touches the `ffmpeg-wasm-*` and
  `zetaoffice-*` prefixes.
- Safari 17+ sizes the origin quota from disk size and evicts whole origins least
  recently used first. In a Safari tab, script-writable storage (including the Cache API
  and service worker registrations) is deleted after 7 days without a visit. Home
  Screen web apps have their own counter. iOS has no install prompt, so the info popover
  tells iOS Safari users to add palico to the Home Screen. Source: WebKit, "Updates to
  Storage Policy". Re-check the wording of that post before relying on the numbers.

## Effect design

The offline logic follows the design pass in the plan. Shapes: `EngineId`,
`OfflineStatus`, `ShellState`, `UpdateState`, `StorageReport`. Errors: `SwUnsupportedError`,
`SwRegistrationError`, `SwUpdateError`, `UpdateBlockedError`, `StorageQuotaError`,
`StorageUnavailableError`, `OfflineCacheError`, `ModelCacheError`.

- Retry: none. The browser retries a failed install on the next load, and engine
  downloads keep the user-driven "Try again" (31 to 200 MB should not retry silently on
  mobile data).
- Escape: every failure of the world falls back to online-only behavior.
- Die: only a busy counter that would go below zero (our own pairing bug).
- R: `ServiceWorkerHost`, `CacheHost` and `StorageHost` are `Context.Service` services with
  live layers in `runtime.ts`. This is a new pattern for the client (the old comment in
  `background-removal.ts` said there is no Layer system on the client). It exists so the
  same graph runs in Vitest on the fakes in `fakes.ts`. The engine specs stay plain
  values and the existing `isEngineCached` code is untouched.
- The service worker file is plain Workbox glue. It has no error channel, so its
  failures show up as registration state in the page.

## Testing

- `bun run test`: unit tests for the header table and parity with `public/_headers`,
  status table, busy counter, update flow, registration events, hourly update poll,
  storage pre-check, verify-after-download and stale bucket cleanup.
Offline isolation is not covered by an automated browser test (we dropped Playwright
to avoid a heavy dev dependency for one spec). It is a manual check, below. The unit
tests still guard the part most likely to drift: the header table and its parity with
`public/_headers`.

Manual check of the shell, with the real `_headers` and SPA fallback:

1. `bun run build`, then `bunx wrangler dev --config wrangler.deploy.jsonc`.
2. Open `http://localhost:8787/` in Chrome. In DevTools, Application > Service
   workers should show `sw.js` activated, and `crossOriginIsolated` should be `true` in
   the console.
3. Stop the wrangler process (do not use the DevTools Offline checkbox alone; stopping
   the server is unambiguous). Hard reload `/` and the `/converter` deep link. Both must
   render, `crossOriginIsolated` must stay `true`, and the image converter must convert
   a file (this starts a built dedicated worker, which needs COEP on its script).
4. The tool header pill should read "Works offline" on `/converter` and "Needs a ~31 MB
   download" on `/video-converter`.

Manual checklist, because engine downloads (31 to 200 MB from external CDNs) do not run
in CI:

1. For each engine (ffmpeg via Video converter, ZetaOffice via Word to PDF, background
   removal): download online, switch to airplane mode, hard reload, confirm
   `crossOriginIsolated === true` in the console, confirm the pill says "Works offline",
   run one job.
2. Repeat as an installed app on Android Chrome and as an iOS Home Screen app.
3. On an iPhone, confirm the 200 MB model write is kept (the old transformers.js cache
   was unreliable on iOS Safari). If it fails the tool shows "Not saved on this device".
4. If possible, re-check on iOS Safari after 8 idle days.

## Problems we faced

1. `vite-plugin-pwa` emitted no service worker (see [Service worker](#service-worker)).
   Fixed by a post-build script.
2. Background removal was not offline-capable. transformers.js loads ONNX Runtime from
   jsdelivr unless `wasmPaths` is set, and the weights lived in the HTTP cache, which
   code cannot query. Fixed by self-hosting ORT (the hashed wasm already shipped in
   `dist`) and a custom Cache API bucket (`src/lib/image/model-cache.ts`).

## Known limits

- ZetaOffice is fetched from `zetaoffice_latest`. A cached engine can drift from the
  vendored, patched `zetaHelper.js` (1.2.0). Pinning a version is a separate issue.
- Offline cross-origin isolation has no automated browser test; it is a manual check.
- Unsaved converted files are lost when the page reloads for an update.
- The background removal model cache on iOS Safari is untested on a device.
- `maskable` was dropped from the manifest icons. A real maskable icon needs
  safe-zone padding (a design task).

## File reference

| File | Responsibility |
| --- | --- |
| `src/sw.ts` | Service worker: precache, navigation fallback, ORT route, header stamping, kill switch |
| `scripts/build-sw.ts` | Bundle the worker and inject the precache manifest |
| `public/_headers` | COOP/COEP/CORP, `/sw.js` no-cache |
| `public/sw-killswitch.json` | Emergency off switch |
| `src/lib/offline/*` | Offline logic (see module map) |
| `src/lib/image/model-cache.ts`, `ort-assets.ts` | Background removal storage and ORT URLs |
| `src/hooks/use-offline-status.ts` | Status hook |
| `src/components/offline/*` | Pill, info popover, update toast |
| `src/lib/offline/*.test.ts` | Unit tests (hosts faked in `fakes.ts`) |

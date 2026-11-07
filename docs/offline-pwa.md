# Offline and install (PWA)

palico is a plain website until you turn offline on. After that, and after one
online visit, it runs every tool that does not need a big engine without a
connection. The big engines stay opt-in downloads. This document explains how the
pieces fit, why they are built this way, and how to test them.

## Table of contents

1. [What works offline](#what-works-offline)
2. [Module map](#module-map)
3. [Service worker](#service-worker)
4. [Turning offline on and off](#turning-offline-on-and-off)
5. [Cross-origin isolation offline](#cross-origin-isolation-offline)
6. [Engines and the status pill](#engines-and-the-status-pill)
7. [Update flow](#update-flow)
8. [Storage and iOS](#storage-and-ios)
9. [Effect design](#effect-design)
10. [Testing](#testing)
11. [Problems we faced](#problems-we-faced)
12. [Known limits](#known-limits)
13. [File reference](#file-reference)

## What works offline

| Tier | What | How it is stored | Size |
| --- | --- | --- | --- |
| Precache | `index.html`, every hashed `/assets/**` except `*.wasm`, `/vendor/**`, home images, favicons, `site.webmanifest` | Workbox precache, written at install | about 19 MB on disk, about 5 MB over the wire |
| Opt-in, ffmpeg | core, wasm, worker | Cache API `ffmpeg-wasm-v<version>`, filled after consent | 31 MB |
| Opt-in, ZetaOffice | `soffice.js/.wasm/.data` | Cache API `zetaoffice-wasm-free`, filled after consent | 53 MB |
| Opt-in, qpdf | `qpdf.wasm` (PDF password tool) | Cache API `palico-qpdf-v<version>`, filled after consent | 1.3 MB |
| Opt-in, background removal | RMBG-1.4 weights and ONNX Runtime | Cache API `palico-model-v1` (weights) and `palico-ort-v1` (ORT), filled after consent | about 200 MB |

Nothing is saved until you turn offline on (see [Turning offline on and
off](#turning-offline-on-and-off)). Once it is on, every route and the non-engine
tools (image converter, resizer, compressor, PDF tools, markdown, diff, favicon
generator) work offline. The video tools, Word to PDF, Protect and Unlock PDF, and
background removal also need their engine saved.

## Module map

```
src/sw.ts                          service worker (thin Workbox glue, no Effect)
scripts/build-sw.ts                bundles sw.ts, injects the precache manifest
src/lib/offline/
  isolation-headers.ts             COOP/COEP/CORP table + stampIsolationHeaders (pure)
  register.ts                      startOffline: wait for consent, register, events,
                                   update poll, cleanup
  toggle.ts                        requestOffline (turn on) and stopOffline (turn off)
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
src/components/offline/            OfflinePill, OfflineInfo (popover), OfflineHint,
                                   UpdatePrompt, offline-actions
src/lib/image/model-cache.ts       Cache API storage for the background removal model
```

## Service worker

`bun run build` runs `vite build` and then `scripts/build-sw.ts`, which bundles
`src/sw.ts` to `dist/client/sw.js` with Vite and injects the file list with
`workbox-build`. The page starts `startOffline` from `src/routes/__root.tsx` in production
builds only. It registers the worker only when offline use is on: a worker is
already registered, the page runs as an installed app, or the person asked (see
below). Registration waits for the window `load` event, so the 5 MB precache never
competes with first paint. A plain visit registers nothing, so a deploy reaches
those visitors on their next load with no worker in between. Dev never registers a
worker.

Why not `vite-plugin-pwa`: with TanStack Start and `@cloudflare/vite-plugin` it keeps
the SSR build's config (`ssr: true`, `outDir: dist/server`) and skips generating the
worker. We measured this; version 2.0.0 never emitted `sw.js`. Revisit if the plugin
gains per-environment support.

Behavior:

- `precacheAndRoute` plus a network-first navigation route. Every navigation asks
  the server first (3 second timeout, with navigation preload on), so a reload after
  a deploy shows the new build at once. The new build's chunks are not in the old
  precache, so they go to the network too. Offline, on timeout or on a non-2xx
  response the route serves the precached `/index.html`, so deep links and hard
  reloads still work offline. URLs ending in a file extension are excluded so a
  missing asset 404s instead of returning HTML.
- Why network first: with a cache-first shell, a reload after a deploy showed the
  old build. The new worker then had to precache about 500 files (about 5 MB) before
  the update toast appeared, and the user still had to click Update.
- `/assets/*` is served `immutable` and precached without a cache-bust parameter
  (`dontCacheBustURLsMatching`), so the install reuses chunks the page already
  fetched instead of downloading them twice. This relies on every file in
  `assets/` having a content hash in its name.
- Same-origin GET only. jsdelivr, `cdn.zetaoffice.net` and huggingface.co are never
  intercepted.
- `/assets/ort-wasm*` is served cache-first from `palico-ort-v1`. The 21 MB wasm is not
  precached; the page stores it on the consented model download.
- `clientsClaim()` so the first visit is controlled without a second load.
- No `skipWaiting` on install. A new version waits for the page to post
  `SKIP_WAITING`.
- The worker answers `GET_BUILD` (on a `MessageChannel`) with its build ID. The ID
  comes from the `palico-build-id` plugin in `vite.config.ts`, which compiles it into
  the app and writes `dist/build-id` for `scripts/build-sw.ts`.
- Kill switch: set `public/sw-killswitch.json` to `{ "disabled": true }` and deploy.
  On activation the worker deletes its precache and unregisters. For a worker that
  never activates, deploy a `sw.js` that calls `registration.unregister()`.
- `/sw.js` is served `Cache-Control: no-cache` (`public/_headers`).

An active worker means the install, and therefore the precache, finished. There is
no separate "precache complete" message.

## Turning offline on and off

`ShellState` has an `Off` case: no worker is registered because offline use was
never turned on, or was turned off again. The status pill then reads "Save for
offline", in the neutral style (sapphire is kept for "needs a download to work").
Home tiles and the search palette show nothing for `Off`, because nothing there
can act on it.

At startup `startOffline` calls `getRegistration()`, `matchMedia("(display-mode:
standalone)")` and reads the stored opt-out (all through `ServiceWorkerHost`, so
tests fake them):

- A registration exists (existing users, or the person turned offline on before):
  register and run the normal flow, as before.
- The page runs as an installed app and the person has not opted out: same, with
  no prompt. Installing is consent.
- Neither: the shell is `Off`, nothing is registered, and the fiber waits for an
  enable request.

### Turning on

An enable request comes from one of these:

| Trigger | Where |
| --- | --- |
| "Save for offline" in the pill popover | `offline-info.tsx` |
| "Try again" in the popover after a failed registration | `offline-info.tsx` |
| "Save when online" on the one-time offline toast | `offline-hint.tsx` |
| A real engine download | `guardedEngineLoad` in `gate.ts` |
| The window `appinstalled` event | `ServiceWorkerHost.appInstalled` |

A real download means the engine was not saved before the load. `guardedEngineLoad`
also wraps the already-saved path that runs on every visit to a tool, and that path
must not switch offline back on after a Stop. The engine consent dialog adds "Also
saves Palico for offline use (about 5 MB)." while the shell is `Off` or `Failed`.

`requestOffline` (`toggle.ts`) has no requirements. It does nothing unless the
shell is `Off` or `Failed`, so a second call while registering or active is a
no-op and a failed registration can be tried again. Otherwise it sets the shell to
`Registering` at once and signals the waiting fiber, which registers and goes
`Registering`, `Installing`, `Active` as usual.

### The stored opt-out

Stop writes `palico-offline = off` to `localStorage` (every access is in a
try/catch, in `ServiceWorkerHost`). Without it, the next launch of an installed
app would register again through the standalone path. The fiber clears it when it
takes an enable request or an `appinstalled` event, so any explicit consent, an
engine download included, ends the opt-out. Only the standalone path reads it: an
existing registration still registers, but Stop removes the registration.

### Turning off

`stopOffline` ("Stop saving offline", shown in the popover while the worker is on):

1. Unregister the worker. If this fails nothing else has changed and the popover
   shows an error toast (`SwDisableError`).
2. Store the opt-out.
3. Send the stop signal, but only when a session really runs (it holds a handle).
   The `startOffline` loop ends the session, which removes its listeners and the
   update poll, then clears the update and reload prompts and sets the shell to
   `Off`. With no session, `stopOffline` cancels a pending enable request and
   sets `Off` itself. A signal sent with no session would wait in the queue and end
   the next session, so the queue is also emptied when each session starts.
4. Delete every Cache API bucket whose name contains `-precache-`. Engine buckets
   (ffmpeg, zetaoffice, qpdf, palico-model, palico-ort) stay: they are the
   person's downloads, and turning offline on again reuses them. A failure here is
   an `OfflineCacheError` toast, but the shell is already `Off`.

The fiber then waits for the next enable request, so the person can switch offline
on again in the same visit.

### The old controller after Stop

The page stays controlled by the old worker until it reloads, although the worker
is unregistered. If the person turns offline on again in that visit, the new worker
installs while `navigator.serviceWorker.controller` still points at the old one. A
check on `controller` alone would read the fresh install as an update and show a
false "new version is ready" toast, and the `controllerchange` when the new worker
claims the page would show a false "Reload to continue". So an update is only
recognised when the registration already had an active worker:
`hadController` is `controlledAtRegistration(reg.active, sw.controller)`, and a
worker that reaches `installed` is an update only if `reg.active` exists.

### The offline hint

The first time the connection drops while the shell is `Off`, `OfflineHint` shows
one toast ("You're offline"), remembered in `localStorage` under
`palico-offline-hint`. Saving the app needs a connection, so the action is
"Save when online": it requests offline use at once if `navigator.onLine` is true,
and otherwise on the next `online` event. A registration that then fails leaves the
shell `Failed` (pill "Not available offline"). The popover explains that saving did
not finish and offers "Try again".

## Cross-origin isolation offline

`public/_headers` puts COOP and COEP on every route and CORP on `/assets/*` and
`/vendor/*`. A response read from the Cache API keeps the headers it was stored with,
so the plain path works. To remove the dependence on what was stored, the worker
re-stamps the headers on every response it serves (`stampIsolationHeaders`). A
Vitest test parses `public/_headers` and fails if the two tables drift. Do not
repeat COEP on the `/assets/*` rule: Cloudflare combines matching rules and
`require-corp, require-corp` is invalid.

## Engines and the status pill

`ENGINES` in `engines.ts` gives the four `isCached` Effects one shape. A tool lists
its engine in `TOOLS` (`engine?: EngineId` in `src/lib/tool-categories.ts`).
`useOfflineStatus(engine)` combines the worker state with the engine check and
returns one of:

| Status | Meaning | Pill |
| --- | --- | --- |
| Off | Offline use is not turned on | neutral, "Save for offline" |
| Ready | Works with no connection now | green, "Works offline" |
| Preparing | Worker installing or engine check running | working |
| NeedsDownload | Engine not saved yet | sapphire, "Needs a ~31 MB download" |
| NotSaved | Download finished but the browser did not keep it | yellow |
| Unavailable | No service worker support or it failed | neutral |

With the shell Off, a tool with an engine still reports its own engine: checking,
missing (NeedsDownload or NotSaved) or saved (Off). The status is recomputed from
real cache contents after every download, so eviction shows up. The tool header shows the full pill (click for an explanation, whether the
browser agreed to keep storage, and the iOS Home Screen hint). Home tiles and the
sidebar show a small dot and label for tools with an engine only, to keep tiles to one
saturated colour (`DESIGN.md`).

The qpdf engine (`src/lib/qpdf/`, see `docs/pdf-password.md`) differs from the others
in one way: it is a single self-hosted 1.3 MB wasm, hashed under `/assets/`, and the
service worker does not serve it. The page stores it in `palico-qpdf-v<version>` on
the consented download, and the job worker reads that bucket itself, so it works
without the service worker and falls back to the network when the bucket is empty.

## Update flow

The update flow only runs for people who turned offline on. Everyone else has no
worker, so there is nothing to wait for and no toast.

1. A new `sw.js` installs and waits. `startOffline` sees the waiting worker and asks
   it for its build ID (2 second timeout).
2. Same ID as the page: the page already runs that build (the usual case after a
   reload, because navigations are network first). The page posts `SKIP_WAITING`
   with no toast and no reload, and ignores the `controllerchange` that follows.
   This is safe while a job runs: the page's own chunks are all in the new precache.
3. Different ID or no answer (the page came from the offline shell, a deploy landed
   while the tab was open, or the worker predates `GET_BUILD`): the update state is
   set and `UpdatePrompt` shows a toast, "A new version is ready". While any job is running
   (`withBusy` count above zero) the Update action is hidden and the toast says to wait.
4. On Update, `applyUpdate` arms the `controllerchange` listener, posts
   `SKIP_WAITING`, waits up to 5 seconds, and reloads once. Nothing reloads by itself.
5. Another tab that updated leaves this tab's lazy chunks missing. A
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
  bump used to leave 31 MB orphaned). It only touches the `ffmpeg-wasm-*`,
  `zetaoffice-*` and `palico-qpdf-*` prefixes.
- Safari 17+ sizes the origin quota from disk size and evicts whole origins least
  recently used first. In a Safari tab, script-writable storage (including the Cache API
  and service worker registrations) is deleted after 7 days without a visit. Home
  Screen web apps have their own counter. iOS has no install prompt, so the info popover
  tells iOS Safari users to add palico to the Home Screen. Source: WebKit, "Updates to
  Storage Policy". Re-check the wording of that post before relying on the numbers.

## Effect design

The offline logic follows the design pass in the plan. Shapes: `EngineId`,
`OfflineStatus`, `ShellState`, `UpdateState`, `StorageReport`. Errors: `SwUnsupportedError`,
`SwRegistrationError`, `SwDisableError`, `SwUpdateError`, `UpdateBlockedError`,
`StorageQuotaError`, `StorageUnavailableError`, `OfflineCacheError`, `ModelCacheError`.

- Retry: none automatic. The browser retries a failed install on the next load, a
  failed registration has a user-driven "Try again" in the popover, and engine
  downloads keep theirs (31 to 200 MB should not retry silently on mobile data).
- Escape: every failure of the world falls back to online-only behavior.
- Die: only a busy counter that would go below zero (our own pairing bug).
- R: `ServiceWorkerHost`, `CacheHost` and `StorageHost` are `Context.Service` services with
  live layers in `runtime.ts`. This is a new pattern for the client (the old comment in
  `background-removal.ts` said there is no Layer system on the client). It exists so the
  same graph runs in Vitest on the fakes in `fakes.ts`. The engine specs stay plain
  values and the existing `isEngineCached` code is untouched.
- Enable and disable are two sliding queues in `state.ts` (`enableQueue`,
  `disableQueue`), so `requestOffline` has no requirements and any caller can run it.
  `startOffline` races each worker session against `disableQueue`, which is how a stop
  ends the session and removes its listeners.
- The service worker file is plain Workbox glue. It has no error channel, so its
  failures show up as registration state in the page.

## Testing

- `bun run test`: unit tests for the header table and parity with `public/_headers`,
  status table (including the Off rows), busy counter, update flow, registration
  events, silent adoption of a same-build worker (and the prompt when builds differ),
  hourly update poll, storage pre-check, verify-after-download, stale bucket cleanup,
  startup with and without a registration, the enable request, installed-app startup,
  the engine download enabling offline, and stop (unregister, only precache buckets
  deleted, back to Off, enable again).
Offline isolation is not covered by an automated browser test (we dropped Playwright
to avoid a heavy dev dependency for one spec). It is a manual check, below. The unit
tests still guard the part most likely to drift: the header table and its parity with
`public/_headers`.

Manual check of the shell, with the real `_headers` and SPA fallback:

1. `bun run build`, then `bunx wrangler dev --config wrangler.deploy.jsonc`.
2. Open `http://localhost:8787/` in a fresh Chrome profile. Application > Service
   workers must be empty and the tool header pill must read "Save for offline". Open
   the pill and press "Save for offline". The pill goes to "Getting ready for
   offline" and then "Works offline", `sw.js` shows as activated, and
   `crossOriginIsolated` is `true` in the console.
3. Stop the wrangler process (do not use the DevTools Offline checkbox alone; stopping
   the server is unambiguous). Hard reload `/` and the `/converter` deep link. Both must
   render, `crossOriginIsolated` must stay `true`, and the image converter must convert
   a file (this starts a built dedicated worker, which needs COEP on its script).
4. The tool header pill should read "Works offline" on `/converter` and "Needs a ~31 MB
   download" on `/video-converter`.

Manual check of turning offline on and off:

1. Fresh profile, reload: no worker is registered and no update toast ever appears.
2. Start a video engine download on `/video-converter`. The consent dialog says it
   also saves palico for offline use. After the download the worker registers by
   itself.
3. In the popover press "Stop saving offline". The worker disappears from
   Application > Service workers, the `workbox-precache` bucket is gone, the ffmpeg
   bucket stays, and the pill reads "Save for offline" or "Needs a download". Turn it
   on again without reloading.
4. Fresh profile, go offline in DevTools: the "You're offline" toast appears once.
   Clear `palico-offline-hint` in localStorage to see it again. Press "Save when
   online", go back online: the worker registers.
5. Install the app (Chrome menu, Install). The worker registers without a click.
   Press "Stop saving offline" in the installed app, close it and open it again:
   no worker registers until you turn offline on.
6. Press Stop, then "Save for offline" again without reloading: no "new version is
   ready" or "Reload to continue" toast appears.

Manual check of the update path (turn offline on first, otherwise there is no worker
to update):

1. With build A running in `wrangler dev`, make any visible change, `bun run build` and
   restart wrangler (build B).
2. Reload once. Build B must show right away with no "A new version is ready" toast.
   In Application > Service workers the new `sw.js` installs and then activates
   without a click.
3. In an extra tab still on build A, the "Reload to continue" toast must appear once B
   activates.

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
3. Updates were slow to reach users. The navigation route served the precached shell,
   so a reload after a deploy showed the old build while the new worker precached
   about 5 MB, and then the user had to click Update. Fixed by network-first
   navigations, silent adoption of a same-build worker, and `immutable` assets that
   the install does not download twice. The build ID lives in `process.env` because
   `vite build` loads the config more than once; a per-load `Date.now()` gave the app
   and `sw.js` different IDs.

## Known limits

- ZetaOffice is fetched from `zetaoffice_latest`. A cached engine can drift from the
  vendored, patched `zetaHelper.js` (1.2.0). Pinning a version is a separate issue.
- Offline cross-origin isolation has no automated browser test; it is a manual check.
- Stop does not reach other tabs. A tab that was open before keeps showing "Works
  offline" until it reloads, and so does a tab opened before Stop on another one.
- Unsaved converted files are lost when the page reloads for an update.
- The background removal model cache on iOS Safari is untested on a device.
- `maskable` was dropped from the manifest icons. A real maskable icon needs
  safe-zone padding (a design task).

## File reference

| File | Responsibility |
| --- | --- |
| `src/sw.ts` | Service worker: precache, network-first navigation with shell fallback, ORT route, header stamping, `GET_BUILD`, kill switch |
| `scripts/build-sw.ts` | Bundle the worker with the build ID and inject the precache manifest |
| `vite.config.ts` (`palico-build-id`) | Build ID for the app and `dist/build-id` |
| `public/_headers` | COOP/COEP/CORP, `immutable` `/assets/*`, `/sw.js` no-cache |
| `public/sw-killswitch.json` | Emergency off switch |
| `src/lib/offline/*` | Offline logic (see module map); `toggle.ts` turns it on and off |
| `src/lib/image/model-cache.ts`, `ort-assets.ts` | Background removal storage and ORT URLs |
| `src/hooks/use-offline-status.ts` | Status hook |
| `src/components/offline/*` | Pill, popover (on and off), offline hint, update toast |
| `src/lib/offline/*.test.ts` | Unit tests (hosts faked in `fakes.ts`) |

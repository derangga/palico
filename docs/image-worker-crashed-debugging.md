# Debugging "Image worker crashed" in production

The image converter and resizer offload all decode/encode work to a Web Worker
(`src/workers/image-converter.worker.ts`), orchestrated from the main thread by
`src/lib/image/worker-client.ts`. The feature worked perfectly in `bun run dev`,
but in the deployed Cloudflare build every conversion failed immediately with a
single toast:

> Image worker crashed.

With the app in Indonesian the same toast reads "Proses gambar berhenti
tiba-tiba." (`error_worker_crashed` in `messages/id.json`). The worker sends the
browser's own error text as `detail`, and `worker-client.ts` words the failure in
the active language, because a worker has no active language of its own.

This document records the problem, the full debugging process, the root cause
(which turned out to be **two** independent bugs), and the fix. It is written so
the next person who sees a worker fail _only in production_ can recognise the
pattern quickly.

## Table of contents

1. [Symptom](#symptom)
2. [Where the message comes from](#where-the-message-comes-from)
3. [The debugging process](#the-debugging-process)
   - [Step 1 — reproduce in dev (it didn't)](#step-1--reproduce-in-dev-it-didnt)
   - [Step 2 — rule out the browser engine](#step-2--rule-out-the-browser-engine)
   - [Step 3 — inspect the production bundle](#step-3--inspect-the-production-bundle)
   - [Step 4 — fix the bundling, retest, hit a second wall](#step-4--fix-the-bundling-retest-hit-a-second-wall)
   - [Step 5 — read the real network error](#step-5--read-the-real-network-error)
   - [Step 6 — test the wrong fix (credentialless)](#step-6--test-the-wrong-fix-credentialless)
   - [Step 7 — confirm the header hypothesis](#step-7--confirm-the-header-hypothesis)
4. [Root cause](#root-cause)
5. [The fix](#the-fix)
6. [Verification](#verification)
7. [Conclusion and lessons](#conclusion-and-lessons)

## Symptom

- Image conversion failed for every file with the message **"Image worker
  crashed."**
- It happened on the **deployed site** and in `bun run preview`.
- It did **not** happen in `bun run dev`.
- The browser console showed a COEP warning about embedded frames, which looked
  related but turned out to be a red herring (it was the TanStack devtools
  iframe).

## Where the message comes from

`src/lib/image/worker-client.ts` spins up a one-shot worker per conversion and
maps its outcomes onto typed errors. The string lives in the `worker.onerror`
handler:

```ts
worker.onerror = (event) => {
  resume(
    Effect.fail(
      new WorkerError({
        fileName: params.fileName,
        message: event.message || "Image worker crashed.",
      }),
    ),
  );
};
```

Two things matter here:

- `worker.onerror` fires for **load/parse failures and uncaught errors**, not for
  the decode/encode failures inside the worker — those are caught and returned as
  structured `ok: false` responses (`reason: "decode" | "encode" | "dimensions"`).
- The fallback string is used when `event.message` is **empty**. An empty
  message is itself a clue: the browser blanks the message when the worker
  **fails to load**, as opposed to throwing at runtime.

So from the first line of code we already knew: the worker was never running. It
was failing to load.

## The debugging process

### Step 1 — reproduce in dev (it didn't)

We drove the converter headlessly with Playwright against the dev server
(`/converter`), uploading a real PNG and clicking Convert. Result:

```
crossOriginIsolated = true
[worker created] http://localhost:3001/src/workers/image-converter.worker.ts
logo512.png  9.4 KB → 25.1 KB (WebP)
```

Dev worked. The worker loaded and converted. So whatever was broken was specific
to the **production build**, not the source logic. (An earlier run with a
synthetic 1×1 PNG produced a _decode_ error — a dead end caused by the test
fixture, not the bug. Always test with a real image.)

### Step 2 — rule out the browser engine

We re-ran the same Playwright reproduction against both **Chromium** (system
Chrome) and **WebKit** (Safari's engine). Both converted successfully in dev with
`crossOriginIsolated = true`. So the bug was not browser-specific — it was
environment-specific (dev vs. production).

### Step 3 — inspect the production bundle

`bun run build`, then we read the built `worker-client` chunk to see how the
worker was actually instantiated. This was the smoking gun:

```js
new Worker(new URL(`data:video/mp2t;base64,<...>` + import.meta.url), {type:`module`})
```

Decoding the base64 revealed the **raw, untranspiled TypeScript** source of the
worker — `let bitmap: ImageBitmap;`, `import type { ... }`,
`(self as DedicatedWorkerGlobalScope)` — embedded as a `data:` URL with MIME type
`video/mp2t` (Vite guessed the MIME from the `.ts` extension).

The browser cannot parse TypeScript, so the module worker failed to load →
`worker.onerror` → "Image worker crashed."

Why did Vite inline raw TS instead of bundling a worker? Because the worker URL
was hoisted into a variable:

```ts
// src/lib/image/worker-client.ts (before)
const workerUrl = new URL("../../workers/image-converter.worker.ts", import.meta.url);
// ...
new Worker(workerUrl, { type: "module" });
```

Vite's static analysis only recognises the worker pattern when
`new URL('…', import.meta.url)` is written **inline inside** `new Worker(...)`.
Behind a variable, Vite treated the `.ts` file as a generic asset and inlined it.
Dev hid this because the dev server transpiles `.ts` on request.

### Step 4 — fix the bundling, retest, hit a second wall

We inlined the URL back inside `new Worker(...)`. After rebuilding, the bundle
now referenced a proper transpiled chunk:

```js
new Worker(new URL(`/assets/image-converter.worker-Dx1aRNTw.js`, import.meta.url), {type:`module`})
```

The raw-TS `data:` URL was gone and a real `image-converter.worker-*.js` chunk
(valid JS, no TypeScript syntax) was emitted. Good. But running the reproduction
against `bun run preview` **still failed** with "Image worker crashed." So there
was a second, independent bug underneath.

### Step 5 — read the real network error

We extended the Playwright script to log failed requests. The truth appeared:

```
[REQUESTFAILED] .../assets/image-converter.worker-Dx1aRNTw.js :: net::ERR_BLOCKED_BY_RESPONSE
```

`net::ERR_BLOCKED_BY_RESPONSE` is a **Cross-Origin-Embedder-Policy block**.
Curling the asset confirmed it was served with only a `content-type` — **no
COOP/COEP/CORP headers** — even though the document itself was cross-origin
isolated (`Cross-Origin-Embedder-Policy: require-corp`, required for ffmpeg's
`SharedArrayBuffer`).

The rule: a **module worker can only be loaded into a cross-origin-isolated
context if its own script response also carries a matching COEP header.** In dev
this was automatic — `vite.config.ts` `server.headers` stamps COOP/COEP on
_every_ response, including the worker. In production and preview, Cloudflare
serves `/assets/*` through the **Workers Assets binding, which bypasses
`src/server.ts`**, so those headers never reach the worker file.

### Step 6 — test the wrong fix (credentialless)

The console warning suggested `Cross-Origin-Embedder-Policy: credentialless`, so
we tried it in both `src/server.ts` and `vite.config.ts`, rebuilt, and retested.
It **did not work** — the worker was still `ERR_BLOCKED_BY_RESPONSE`.
`credentialless` only changes how _cross-origin no-cors_ subresources load; it
does not waive the requirement that a module worker's own script carry a COEP
header. We reverted it.

### Step 7 — confirm the header hypothesis

We already had the positive and negative controls:

| Environment | Worker asset COEP header | Result               |
| ----------- | ------------------------ | -------------------- |
| dev         | present (`require-corp`) | loads & converts ✓   |
| preview     | absent                   | `ERR_BLOCKED_BY_RESPONSE` ✗ |

The single differing variable was the COEP header on the worker asset. We added a
`public/_headers` file tagging `/assets/*` with COEP + CORP, rebuilt, and
confirmed the preview now served the worker with:

```
cross-origin-embedder-policy: require-corp
cross-origin-resource-policy: same-origin
```

The end-to-end reproduction against the production preview build then passed:
worker loaded (200), `crossOriginIsolated = true`, conversion succeeded.

## Root cause

Two independent, production-only bugs stacked on top of each other:

1. **Worker bundled as untranspiled TypeScript.** The worker URL was hoisted to a
   variable, defeating Vite's `new Worker(new URL(...))` detection, so the build
   inlined the raw `.ts` source as a `data:` URL the browser couldn't parse.

2. **Worker asset missing its COEP header.** Once it was a real asset, Cloudflare
   Workers Assets served it without the COOP/COEP headers (those only apply to
   the SSR responses from `src/server.ts`). Because the document is cross-origin
   isolated for ffmpeg, the browser blocked the un-tagged module worker with
   `net::ERR_BLOCKED_BY_RESPONSE`.

Both were masked in dev: Vite transpiles `.ts` on the fly, and the dev/preview
middleware stamps COOP/COEP on every response.

## The fix

**1. `src/lib/image/worker-client.ts`** — inline the `new URL(...)` inside
`new Worker(...)` so Vite bundles and transpiles the worker as a proper chunk.
This also fixes the resizer, which shares `runImageWorker`.

```ts
new Worker(
  new URL("../../workers/image-converter.worker.ts", import.meta.url),
  { type: "module" },
);
```

**2. `public/_headers`** (new) — tag the built assets so module workers can load
under cross-origin isolation. `public/` is copied to `dist/client/`, and
Cloudflare Workers Assets honours `_headers`.

```
/assets/*
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Resource-Policy: same-origin
```

We deliberately kept `require-corp` (not `credentialless`) so ffmpeg's
multi-threaded `SharedArrayBuffer` keeps working across browsers, including
Safari, which does not support `credentialless`.

## Verification

A headless Playwright run against `bun run preview` (which reproduces Cloudflare's
asset-serving path) confirmed:

- the worker is requested at `/assets/image-converter.worker-*.js` and returns
  `200` with the COEP/CORP headers;
- `self.crossOriginIsolated === true` (so video/ffmpeg is unaffected);
- conversion succeeds end to end (`9.4 KB → 25.1 KB WebP`).

`bun run check` and `bun run tsc --noEmit` both pass.

> Because this is a production-only failure, after merging, redeploy with
> `bun run deploy` and do a quick real-browser check. Preview mirrors Cloudflare's
> asset behaviour closely, but the live deploy is the final confirmation.

## Conclusion and lessons

- **"Worker crashed" with an empty `event.message` means the worker failed to
  load, not a runtime error.** Look at the network tab / `requestfailed` events,
  not the worker's own logic.
- **Always reproduce against the production build for worker/bundler bugs.** Dev
  transpiles `.ts` and stamps headers on every response, hiding both classes of
  failure here.
- **Keep `new Worker(new URL('…', import.meta.url), …)` inline.** Hoisting the URL
  to a variable silently breaks Vite worker bundling.
- **Cross-origin isolation is per-resource.** Setting COOP/COEP on the document
  (`src/server.ts`) is not enough; module workers and other assets need their own
  headers, which on Cloudflare means `public/_headers` because Workers Assets
  bypass the SSR handler.
- **`credentialless` is not a drop-in relaxation for workers.** It helps
  cross-origin no-cors subresources, not a module worker's own script load.

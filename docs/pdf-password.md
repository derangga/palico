# Lock or unlock PDF

One page, one registry entry, one switch. `/pdf-password` adds a password to a PDF
(Lock) or removes it (Unlock). The route is `src/routes/pdf-password.tsx`, the
registry entry is `pdf_password` ("Lock or unlock PDF", File category, qpdf engine),
and there is one tile, sidebar entry, search result, page title and sitemap line. It
began as two pages (`/pdf-protect`, `/pdf-unlock`) over one component; they were merged
before release, so no old URL needs to keep working.

The page is `PdfPasswordTool` (`src/components/pdf-password/pdf-password-tool.tsx`). It
owns the engine gate, the file, what `detectEncryption` said about it, and the mode.
Each mode is its own form: `lock-form.tsx` and `unlock-form.tsx`. They share
`use-password-job.ts` (run the job, keep its outcome), `done-card.tsx` and
`blocked-note.tsx`. Inside the code the modes are still named `protect` and `unlock`
(`PasswordMode`); the screen says Lock and Unlock.

## The mode switch

A `SegmentedControl` (Lock | Unlock) sits above the dropzone, so the person says what
they want before they drop anything.

- **Starting mode.** `?mode=protect` or `?mode=unlock` opens the page on that mode, for
  a link from another tool (anything else in `mode` is ignored). With no link it starts
  on Lock.
- **It follows the file, once.** When a file has been read, an untouched switch moves
  to `suggestMode(status)`: a file with a password starts on Unlock, any other on Lock.
- **The person's choice always wins.** After the switch has been used (or the link set
  a mode), the page never moves it again. If the file looks like it belongs in the
  other mode (`modeHint`), a note says so and has a "Switch to ..." button. The guess
  can be wrong (a locked file may only limit printing, which Lock replaces), so it
  never blocks and qpdf makes the real decision.
- **No form until the file is read.** The form mounts once `detectEncryption` has
  answered (a quick read), because the mode may still move to match the file, and a
  form that mounted first would be replaced while the person types or a job runs.
- **Clicking the segment that is already on counts** as choosing (the radio fires no
  change event, so the wrapper marks it on click).
- **The file stays** when the mode changes. Nothing is dropped twice. After the note's
  button is used, focus moves to the switch, since the button leaves with the note.
- **A link to `?mode=` while on the page** opens that mode: the route keys the page by
  the link's mode.
- **Passwords do not.** Each form owns its typed passwords and is remounted (new `key`)
  per mode and per file, so switching mode, or choosing another file, discards them.
  The same goes for an engine failure: the engine card replaces the page body, and the
  form comes back empty when the engine is ready.
- **Off while a job runs.** `working` lives in the page. The switch, "Choose another"
  and the note's button are disabled until the job ends, because switching would unmount
  the form that is waiting for the result.

Motion: the switch's highlight slides on `translate`, and a segment scales to 0.97 on
press, off under reduced motion (both are in the shared component, so the JSON
converter's switch gets them too). The form below fades in over 150 ms with a
4 px rise, `ease-out`, opacity only under reduced motion. It is a CSS transition from
`starting:` styles on the remounted form, so it can be interrupted. It only plays when
the last input on the switch was a pointer: arrow keys switch with no animation.

## Flow

1. The user drops one PDF (50 MB). `detectEncryption` (`src/lib/pdf-password/detect.ts`)
   reads it in 1 MB slices and looks for the trailer's `/Encrypt` key. It needs no
   engine. A result for a file that was replaced while it was being read is dropped.
2. The mode follows the file, or a note offers a switch (see above).
3. Lock asks for the password twice. A hint says how strong it is, and never
   blocks. "Advanced" adds an owner password and three permissions (print, copy,
   edit); clearing the owner password puts the permissions back on. The output is
   `<name>_protected.pdf`, AES-256.
4. Unlock asks for the open password and writes `<name>_unlocked.pdf`. Leave the
   field empty for a file that opens without a password but limits printing or
   copying (an owner password only).
5. The job runs in a worker and the output is re-opened before it is offered
   (see "Verification"). The file then downloads, the card keeps a button to
   download it again, and the typed passwords are cleared from the page's state.
   After a failure they are kept, so a wrong password can be fixed.

The password is never in the address.

## Why qpdf, and why a wasm engine

pdf-lib 1.17.1 can neither read nor write encrypted PDFs. qpdf can, including
AES-256 (revision 6), and it is the reference tool for it. The package is
`@neslinesli93/qpdf-wasm` 0.3.1 (ISC licence for the build wrapper; qpdf 12.2.0
inside it is Apache-2.0). `qpdf.wasm` is 1.33 MB raw and about 0.44 MB gzipped, and
the glue code is 16.6 KB gzipped. It runs in a module worker.

## The engine, and sharing it

The engine is the `src/lib/qpdf/` folder. It is written so a second tool (a lossless
compression pass for the PDF compressor, say) can use it without touching this tool.

| File | Job |
| --- | --- |
| `assets.ts` | The wasm's URL (`?url`, same origin and hashed), size, `isQpdfCached`, the load phases. No engine code, so a route can import it |
| `engine.ts` | `loadQpdfEngine(onPhase)`: download with progress, store in the Cache API. Run it through `guardedEngineLoad("qpdf", ...)` |
| `run.ts` | Worker side. `runQpdf({ wasm, inputs, steps, outputs })` runs qpdf command lines on an in-memory file system and returns each command's exit code and text. `hooks` is the test seam |
| `handle.ts` | `answerQpdfRun`: the worker's answer to a `qpdf-run` request, as a function that returns the message to post |
| `scrub.ts` | `scrub` removes secrets from text that leaves the worker; `passwordsInArgs` finds qpdf's password flags |
| `fakes.ts` | Test helpers: run the real wasm in node. Not imported by app code |
| `worker-client.ts` | `runInWorker` (one fresh worker per job, terminated when it ends) and `runQpdfJob`, the generic job |
| `protocol.ts` | The `qpdf-run` message pair, for tools that build their own command lines |
| `types.ts`, `errors.ts` | Shared shapes, `PdfEngineLoadError`, `QpdfWorkerError` |

`src/workers/pdf-crypt.worker.ts` answers two requests: `qpdf-run` (any command
lines, from any tool) and `crypt` (Protect or Unlock, then the re-open). It is a thin
wiring file over `answerQpdfRun` and `answerCrypt` (`src/lib/pdf-password/answer.ts`).
It takes one job and refuses a second request, so the console swap below never nests.
The stdout and stderr that `runQpdfJob` returns are qpdf's own text, raw; error
messages are scrubbed, but a tool that shows that text owns what is in it. A second
consumer calls `runQpdfJob`, and uses `useQpdfGate` and `EnginePanel`, or the same
three pieces of its own, for the consent card.

### How it is stored and gated

- Engine id `qpdf` in `src/lib/offline/engines.ts`, Cache API bucket
  `palico-qpdf-v0.3.1` (`cache-names.ts`). A Vitest test fails when the bucket name
  and the installed package version drift, and when `QPDF_WASM_BYTES` is not the real
  file size.
- The wasm is not in the Workbox precache (`*.wasm` is excluded). It is stored on the
  consented download, behind `EngineConsentCard`, like ffmpeg and ZetaOffice.
- The job worker reads the wasm from the Cache API itself, and only falls back to the
  network. It does not depend on the service worker, so it works on a first visit or
  after a hard reload. Offline with the cache empty, the worker fails with
  `PdfEngineLoadError`, the page shows the engine card with Try again, and the
  offline pill says what is missing.
- 1.3 MB is small enough to precache, which would drop the consent step. The product
  decision was to keep it behind the gate, like the other engines.

### How the wasm reaches the glue

This build of the Emscripten glue ignores `wasmBinary`. It always fetches the file
that `locateFile` names, and with no `locateFile` it fetches `qpdf.wasm` from beside the
worker script, which is not where the bundler puts it (it emits `qpdf-<hash>.wasm`).
The first version passed `wasmBinary`, which worked in node (where the glue reads
files) and would have 404ed in a browser. So `run.ts` makes a blob URL over the bytes it
already holds, passes `locateFile: () => blobUrl`, and revokes the URL once the engine
has started. `run.test.ts` loads the shipped glue into a `vm` context shaped like a
dedicated worker (no `process`, a `WorkerGlobalScope`, a `fetch` that records URLs)
and checks that only that blob URL is ever fetched, that it is revoked, and, as a
pin, that the glue does still ignore `wasmBinary`. If a newer glue honoured it, that
test would say so.

### The console trick

The glue also ignores the `print` and `printErr` options. It calls `console.log` and
`console.error`, bound when the module starts. `run.ts` swaps both for capturing
functions while the module starts, then restores them, and points a sink at each
command's output. qpdf's text is how a wrong password and certificate security are
told from a broken file. If the module fails to start, whatever the glue said while
failing is added to `QpdfStartError`'s message, and the worker scrubs it before posting.
If a future build changed the logging, the text would be empty and every failure would
read as "invalid PDF", never as a wrong success. `crypt.test.ts` runs the real wasm in
node and would fail first.

## Command lines

Built in `src/lib/pdf-password/args.ts`, pure.

```
qpdf --encrypt --user-password=U --owner-password=O --bits=256
     --print=full|none --extract=y|n --modify=all|none --accessibility=y -- in out
qpdf --decrypt --password=P in out
```

- The flag form (qpdf 11.7 and later) takes any text as a password. The positional form
  `--encrypt U O 256 --` breaks on a password that starts with `-`. A test covers
  dashes, quotes, `=`, non-Latin text and emoji.
- `--accessibility=y` always: screen readers may read text out even when copying is off.
- With no owner password, the open password is used as the owner password and every
  permission stays on. qpdf refuses an empty owner password with a non-empty open
  password, and a permission limit does not hold against someone who can become the
  owner by knowing the open password. The three switches stay disabled until an
  owner password exists, and `normalizeProtect` enforces it for any other caller.
  A hint warns when the owner password equals the open one.
- Permissions are advisory. Most readers follow them and the file format cannot make
  them. The form says so.

## Verification

Every job runs four commands, then a pdf.js re-open, and offers the file only if all
pass.

| Mode | qpdf commands | pdf.js re-open |
| --- | --- | --- |
| Protect | `--show-encryption` on the source, `--show-npages` on the source, encrypt, `--show-encryption --password=U` on the output (must say R = 6 and AESv3) | Opens with the password with the same page count. Opening without it is refused (`PasswordException`) |
| Unlock | `--show-encryption --password=P` on the source, `--show-npages`, decrypt, `--show-encryption` on the output (must say "File is not encrypted") | Opens with no password with the same page count |

A failing command ends the run. `classify.ts` reads the exit codes (0 and 3 are
success) and qpdf's text, and is tested against what qpdf 12.2 really writes. A file
that passes qpdf but fails the re-open is `OutputVerificationError`, and no download
is offered.

## Errors

All are `Schema.TaggedError` on the Effect error channel. The worker reports a
reason string (it has no active language); `map-error.ts` makes the tagged error and
words it on the page.

| Error | When | On screen |
| --- | --- | --- |
| `WrongPasswordError` | qpdf says "invalid password" | The field turns red, keeps focus with its text selected. No limit on tries |
| `UnsupportedEncryptionError` | Certificate (public-key) security or an unknown handler | Inline: "This PDF is locked with a certificate, not a password" |
| `PasswordMismatchError` | Protect fields differ | Inline under the second field, live, and again on submit before any work |
| `EmptyPasswordError` | Protect with no password | Inline under the first field, before any work |
| `PdfEngineLoadError` | Wasm cannot be downloaded, stored or started | The engine card with Try again |
| `NotEncryptedError` | Unlock on a file with no password | Inline message |
| `AlreadyEncryptedError` | Protect on a file that needs a password to open | Inline message (the switch to Unlock is the page note above) |
| `OutputVerificationError` | The re-read failed | A toast |
| `InvalidPdfError`, `PdfTooLargeError`, `PdfWorkerError` | The existing PDF errors | A toast |

`outcome.ts` handles all eleven by tag with `Effect.catchTags`, so a new error is a
type error until it has a place on screen. A defect is caught too (`catchCause`) and
becomes a `failed` toast, so the promise the page awaits never rejects and the form
cannot stay on "Working". The page then reads one value, a
`JobOutcome`: `done`, `field`, `blocked`, `engine` or `failed`.

## Effect design

```
protect(file, form)
  validateProtect(form)       E: EmptyPasswordError | PasswordMismatchError
  checkSize(file)             E: PdfTooLargeError
  file.arrayBuffer()          E: InvalidPdfError
  PdfCrypt.run(job)           R: PdfCrypt   E: the worker's reasons, as tagged errors
```

`PdfCrypt` (`service.ts`) is the one seam. `PdfCryptLive`, in the same file, runs it in a
worker; tests give a fake, so `outcome.test.ts` runs the same graph in node. Nothing retries: every
failure is a value the person acts on. `withBusy` wraps the job so an update cannot
reload the page under it.

## Passwords

A password goes to the worker in one message (inside the job), is placed in qpdf's
command lines only inside the worker, and the worker is terminated when the job ends.
It is never logged, stored, put in the address or sent to analytics. Error text from
the worker (qpdf's last line, a JS error message, `worker.onerror`) passes through
`scrub`, which removes every secret from it, both in the worker and again on the page. The fields set `autocomplete="off"` and the common password-manager opt-outs,
because this is a password for a file, not a login. Unlock says it is for files you
own or may open, and that it cannot guess or crack a password.

## Tests

- `args.test.ts`, `classify.test.ts`, `detect.test.ts` (detection, `suggestMode` and `modeHint`),
  `form.test.ts` (validation, normalising, strength, file names), `map-error.test.ts`:
  the pure parts.
- `crypt.test.ts`: the real qpdf wasm in node (the pdf.js re-open is faked). Protect
  then Unlock round trips, permissions read back, owner-only files, wrong passwords
  with retries, certificate security, plain and already locked inputs, and that
  failure text never holds a password.
- `outcome.test.ts`: the page's outcomes on a fake `PdfCrypt`, including a defect.
- `src/lib/qpdf/run.test.ts`: the glue in a fake worker (above), and the generic
  `qpdf-run` request (`answerQpdfRun`): command lines, a failing command, the engine
  not loading with password flags scrubbed.
- `src/lib/qpdf/assets.test.ts`: bucket name, package pin, wasm size.

## Not done

- Batch. One file at a time.
- Changing the permissions of an already protected file, or re-protecting a locked one
  (Unlock first).
- 128-bit or 40-bit encryption, and certificate encryption in either direction.
- Password recovery of any kind.
- A real browser run. The worker, the pdf.js re-open and the Cache API path have only
  been type-checked. The qpdf commands and their classification are tested against the
  real wasm in node, and the glue's worker behaviour in a `vm` fake.
- `src/workers/pdf.worker.ts` still carries its own copy of the two pdf.js factory
  classes now in `src/lib/file/pdf-headless.ts`. Point it at that module when the file
  is free to edit.

# Chain tools: "Send to..."

Every result that is a file has a "Send to..." button beside its Download
button. It opens the next tool with the file already loaded, so the person does
not download it and pick it again. The file stays in the tab's memory the whole
way.

## Flow

1. **Pick.** The source tool renders `SendTo` with its tool id and its outputs.
   The menu lists the source tool's `next` steps first, then every other tool
   whose `accepts` matches all the outputs, in registry order. It never lists
   the source tool. When nothing matches (an audio cut, a mixed batch of images
   and PDFs), the button is not shown.
2. **Put.** `sendHandoff` stores `{ files, from }` in the `Handoff` service under
   a random 8-character id and navigates to `/<target>?handoff=<id>`. Other
   params can ride along: "Send to Unlock" on the PDF compressor opens
   `/pdf-password?mode=unlock&handoff=<id>`. A put first drops any older
   entry, so at most one set of files waits in memory. An entry nobody took
   (the person sent to a video tool, did not enable its engine and left) is
   freed by the next send or when the tab closes.
3. **Take.** The target page calls `useHandoff(onFiles, { hasFile })` in the component that
   owns its dropzone. On mount it takes the entry once, removes `?handoff=` with
   `navigate({ replace: true })` and passes the files to `onFiles` as a
   `FileList`. That is the same function the dropzone calls, so a sent file goes
   through the same checks (type, size, count) as a dropped one.
4. **Show.** `HandoffNotice` sits above the file or dropzone. With the sent
   file loaded it shows a "From Video cutter" chip that links back to the source
   tool. A one-file tool that was sent several files takes the first and says
   so. The hook watches `hasFile`: once the page has no file (Choose another,
   Clear), the chip is gone for good, so it never labels a file the person
   picked later. A sent file the page turned down (wrong type, too large) gets
   no chip, only the page's own toast.
5. **Reload.** The id is in the address but the map is empty. `take` fails with
   `HandoffMissingError` and the page shows its normal dropzone with "Drop the
   file again". An id that does not decode is treated the same way. The note
   goes away once a file is loaded.

Back from the target never replays the handoff: the param was replaced away and
the entry was deleted when it was taken. Back opens the source tool fresh. Its
result lived in that page's state, which went away when the person left it, so
the person would run the job again (or come forward again to the target).

## Why memory, not IndexedDB

palico promises that files never leave the device and are not kept. A file
written to IndexedDB, localStorage, the Cache API or the URL would outlive the
tab, show up in the browser's site data and need a cleanup path that can fail.
A module-level `Map` lives exactly as long as the tab's JavaScript. A reload, a
closed tab or a new tab empties it, and nothing else ever has a copy.

The cost is that a reload on the target page loses the file. That is the
"Drop the file again" case, and it is shown as a calm note, not an error.

## The registry

Each `Tool` in `src/lib/tool-categories.ts` has:

- `id`: the `ToolId`.
- `accepts`: MIME types or patterns (`image/*`) the tool takes. Empty for a tool
  that takes no file (QR generator, cron, JWT decoder, Markdown preview, diff
  viewer). Keep it in step with the dropzone's `accept`. The JSON converter is
  also empty: its file input only reads text into the editor, and no palico
  tool outputs JSON, CSV or YAML. Give it `accepts` and `useHandoff` when one
  does.
- A sent file goes through the target's own checks, so `accepts` is no
  stricter than the dropzone. A GIF from Video to GIF is offered to the Resizer,
  which keeps its first frame, exactly as when the GIF is dropped there.
- `next`: the two or three best next steps, listed first.

A new tool joins chaining by filling in `accepts`. To appear in the menu it also
needs `useHandoff` on its page. To send, it needs `SendTo` on its result.

`buildSendMenu` (`src/lib/handoff/menu.ts`) is pure and tested against the real
registry. Matching is on MIME type, so an output Blob with no type is typed from
its file name (`src/lib/handoff/mime.ts`).

## Lazy outputs

Some results are not plain files when the job ends:

- PDF split (split mode) and PDF to images make a zip. `zippedOutputs` sends the
  files inside it. The zip is unpacked with fflate only when the person picks a
  target, so a result that is never sent is never unpacked. A failure is
  `HandoffUnzipError` and shows a toast.
- The QR generator draws its PNG only when it is saved or sent.

`SendTo` takes these as `LazyOutputs`: the type and count for the menu, and an
Effect that makes the files.

## Tools that downloaded right away

PDF merge, split, organize and to images used to download as soon as the job
ended and show nothing after. They now keep the result on screen in a
`SavedResult` row (Save again, Send to...). The row hides when its input changes
(the list is reordered, the pages are edited, another PDF is opened), because it
would no longer describe what is on screen.

## How it is built

```
src/lib/handoff/
  shapes.ts     HandoffId (branded, 8 chars a-z0-9), HandoffEntry
  errors.ts     HandoffMissingError, HandoffUnzipError
  service.ts    Handoff: put, take, over a module-level Map (layerWith for tests)
  client.ts     putEntry, takeEntry, and the sync sendHandoff / receiveHandoff
  menu.ts       matchesType, acceptsAll, buildSendMenu (pure)
  mime.ts       typeFromName
  unzip.ts      filesFromZip, zippedOutputs
  fakes.ts      makeFakeHandoff: a seeded or empty Map
src/hooks/use-handoff.ts         the target page's hook
src/hooks/use-send-files.ts      toFile and useSendFiles (put + navigate)
src/components/handoff/send-to.tsx        the button: menu, or bottom sheet below 768px
src/components/handoff/handoff-notice.tsx "From X" chip and "Drop the file again"
src/components/handoff/saved-result.tsx   the result row for the PDF tools above
```

The root route's `validateSearch` keeps `handoff` as a string, so every route
can read it and `navigate` can set it with types. The page decodes it into a
`HandoffId`.

```
-> SendTo pick(target)
  -> LazyOutputs.load (zip, QR)        E: HandoffUnzipError -> toast, stay
  -> Handoff.put(entry)                R: Handoff
  -> navigate /<target>?handoff=<id>
-> useHandoff on mount
  -> decode HandoffId                  E: HandoffMissingError -> "Drop the file again"
  -> Handoff.take(id)                  E: HandoffMissingError -> "Drop the file again"
  -> navigate (replace, no handoff)
  -> onFiles(FileList)
```

Tests (`handoff.test.ts`) run the same graph with `makeFakeHandoff`. A fresh Map
stands for the page after a reload.

## Not in v1

- Target settings do not carry over (the compressor preset, the converter's
  format).
- The search palette has no "send to" entry.
- No confirm before leaving the source page, even though its result is not kept
  once the person leaves.
- A locked PDF (PDF password, Lock mode) has no "Send to...": no other tool can
  open it without the password.
- An engine-gated target (video tools, Office, background removal, PDF
  password) takes the files on mount, but its file area only shows once the
  engine is ready. A video or audio page mounts its dropzone only after the
  engine loads, so the take happens then. The engine's consent screen does not
  say that a file is waiting.

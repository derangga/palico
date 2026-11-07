# palico

An offline-first toolkit for images, video, audio, PDFs and files. Everything runs in
the browser, so files never leave the device. It exists as a trustworthy,
friendly alternative to converter sites that upload your files and bury the
page in ads.

## Rules the code does not show

- Write business logic outside the UI layer with Effect. Image and PDF work runs
  in the web workers in `src/workers/`.
- Make every error a tagged `Schema.TaggedError` on the Effect error channel, so
  call sites handle it explicitly.
- Run package scripts with `bun`, `bun run` and `bunx`.

## Workflow

- Work on a branch. If you are on `master`, create one before the first edit.
- Before finishing a code change, run `bun run typecheck` and `bun run check`
  (oxlint + oxfmt), and fix the errors in files you touched. `bun run format`
  applies the formatting.

## Where to look

Read the matching file before starting that kind of work.

- `PRODUCT.md`: users, purpose, brand personality, design principles. Read it
  before any UI or copy change.
- `DESIGN.md`: colour tokens, typography, components, motion. Read it before
  any UI work.
- `docs/background-removal.md`, `docs/image-compressor.md`,
  `docs/metadata-stripper.md`, `docs/office-to-pdf.md`,
  `docs/pdf-organize.md`, `docs/pdf-to-images.md`,
  `docs/video-converter.md`, `docs/video-cutter.md`, `docs/video-to-gif.md`,
  `docs/extract-audio.md`, `docs/audio-cutter.md`, `docs/video-compressor.md`, `docs/qr-code.md`,
  `docs/palette-extractor.md`, `docs/color-picker.md`, `docs/cron-generator.md`, `docs/json-converter.md`, `docs/jwt-decoder.md`, `docs/pdf-compressor.md`:
  how each tool works end to end and why it is built that way.
- `docs/bottom-sheets.md`: the swipeable bottom sheet (`ui/drawer.tsx`), where it
  replaces a popup below 768px, and the markdown preview sheet. Read it before
  adding a sheet or touching `src/components/markdown-preview-drawer.tsx`.
- `docs/recent-tools.md`: the "Your tools" row on Home, the star toggle, the
  `palico-tools` storage key and `recordToolUse`. Read it before adding a tool
  (every tool must call `recordToolUse` when a result is ready) or touching
  `src/lib/tool-history/`.
- `docs/search.md`: the Cmd/Ctrl+K tool palette and how it ranks results. Read it
  before touching `src/components/search/` or `src/lib/tool-search.ts`. Every
  new tool needs `keywords` in `src/lib/tool-categories.ts`.
- `docs/i18n.md`: the English and Indonesian messages, how the language is chosen
  and switched, and how to add a string. Read it before adding any user-facing
  text. Every new string needs a key in both `messages/en.json` and
  `messages/id.json`.
- `docs/offline-pwa.md`: the service worker, offline status pills, update flow and
  storage handling. Read it before touching `src/sw.ts`, `public/_headers`,
  `src/lib/offline/` or an engine's cache.
- `docs/image-worker-crashed-debugging.md`: the checklist for an "Image worker
  crashed" error in production.
- `docs/ui-audit.md`, `docs/ui-colorful-exploration.md`: the reasoning behind the
  November 2026 redesign. Read them before reversing one of its decisions.

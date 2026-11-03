# palico

An offline-first toolkit for images, video, PDFs and files. Everything runs in
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
- Before finishing a code change, run the type check and the Biome check from
  the `package.json` scripts, and fix the errors in files you touched.
- Track work in bd (beads), not markdown TODOs. Run `bd prime` for the workflow.

## Where to look

Read the matching file before starting that kind of work.

- `PRODUCT.md`: users, purpose, brand personality, design principles. Read it
  before any UI or copy change.
- `DESIGN.md`: colour tokens, typography, components, motion. Read it before
  any UI work.
- `docs/background-removal.md`, `docs/image-compressor.md`,
  `docs/metadata-stripper.md`, `docs/office-to-pdf.md`,
  `docs/pdf-organize.md`, `docs/pdf-to-images.md`,
  `docs/video-converter.md`, `docs/video-cutter.md`, `docs/extract-audio.md`:
  how each tool works end to end and why it is built that way.
- `docs/image-worker-crashed-debugging.md`: the checklist for an "Image worker
  crashed" error in production.
- `docs/ui-audit.md`, `docs/ui-colorful-exploration.md`: the reasoning behind the
  November 2026 redesign. Read them before reversing one of its decisions.

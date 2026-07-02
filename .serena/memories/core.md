# Core — palico

Offline-first file toolkit (image, video, PDF/Office, Markdown). Files never leave the device.

## Source Map

```
src/
  routes/
    __root.tsx      # Root layout + sidebar
    index.tsx       # Homepage
    converter.tsx, resizer.tsx, background-removal.tsx, favicon-generator.tsx  # image tools
    video-converter.tsx, video-cutter.tsx                                       # video tools
    office-to-pdf.tsx, pdf-merge.tsx, pdf-split.tsx, diff-viewer.tsx             # file/PDF tools
    markdown-preview.tsx                                                        # markdown tool
  lib/
    image/          # Image logic — see `mem:image_lib`
    video/           # Video logic (ffmpeg.wasm) — see `mem:video_lib`
    file/            # PDF + Office-to-PDF logic — see `mem:file_lib`
    markdown/        # Markdown preview + mermaid — see `mem:markdown_lib`
    utils.ts        # Shared utils (cn helper)
  workers/
    image-converter.worker.ts  # Web Worker for image converter (OffscreenCanvas)
    pdf.worker.ts               # Web Worker for PDF ops
  components/ui/    # shadcn/Base UI components
  routeTree.gen.ts  # Auto-generated — never hand-edit
  router.tsx        # getRouter() factory
  server.ts         # Cloudflare Worker entry + COOP/COEP headers
  styles.css        # Tailwind v4 global styles + design tokens
```

## Invariants

- `routeTree.gen.ts` is generated — run `bun run generate-routes` after adding/renaming routes.
- `src/server.ts` is the wrangler entry (set via `wrangler.jsonc main`) — overrides TanStack Start's default SSR entry so COOP/COEP headers can be injected.
- Path alias `#/*` → `./src/*` (also `@/*` maps the same).
- All processing is client-side; server only serves HTML/assets.
- COOP/COEP headers (cross-origin isolation) are required for WASM threading — needed by video (ffmpeg.wasm) and Office-to-PDF (LibreOffice WASM) engines.

## References

- Image domain logic: `mem:image_lib`
- Video domain logic: `mem:video_lib`
- File/PDF/Office domain logic: `mem:file_lib`
- Markdown domain logic: `mem:markdown_lib`
- Tech stack: `mem:tech_stack`
- Code conventions: `mem:conventions`
- Task completion: `mem:task_completion`

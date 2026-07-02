# palico

## Overview

palico is an offline-first file toolkit that runs entirely in the browser —
files never leave the device. It's built for everyday, mostly non-technical
people who need to quickly convert, resize, cut, or clean up a file (an
image, video, PDF/Office document, or Markdown note) without uploading
personal files to an unknown server. No ads, no upload-to-server dark
patterns — just a fast, trustworthy tool that gets one job done in a few
clicks.

Current tools:

- **Image** — converter, resizer, background removal, favicon generator
- **Video** — converter, cutter
- **File** — Word-to-PDF converter, PDF merge, PDF split, diff viewer
- **Markdown** — live preview with GFM, syntax highlighting, and mermaid diagrams

## Tech Stack

- **Runtime / package manager:** [Bun](https://bun.sh/)
- **Framework:** [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) (file-based routes)
- **UI:** [shadcn](https://ui.shadcn.com/) components on [Base UI](https://base-ui.com/) primitives, [Tailwind CSS v4](https://tailwindcss.com/)
- **Logic:** [Effect](https://effect.website/) for typed effects/errors; all business logic outside the UI layer is written in Effect
- **In-browser processing:** Web Workers, `@ffmpeg/ffmpeg` (ffmpeg.wasm) for video, LibreOffice WASM for Office-to-PDF, `@huggingface/transformers` for background removal, `pdf-lib`/`pdfjs-dist` for PDF ops, `mermaid` + `react-markdown` for Markdown
- **Lint/format:** [Biome](https://biomejs.dev/)
- **Testing:** [Vitest](https://vitest.dev/)
- **Deploy:** [Cloudflare Workers](https://developers.cloudflare.com/workers/) via `wrangler`

## Pre-requisites

- [Bun](https://bun.sh/) (runtime and package manager — never use `npm`/`npx`, always use `bun`/`bunx`)
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (only needed for deploying to Cloudflare)

## Development

1. Install dependencies:

   ```bash
   bun install
   ```

2. Start the dev server (runs on `:3000`):

   ```bash
   bun run dev
   ```

3. If you add or rename a route under `src/routes/`, regenerate the route tree:

   ```bash
   bun run generate-routes
   ```

4. Before finishing any change, both of these must pass:

   ```bash
   bun run check        # Biome lint + format
   bun run tsc --noEmit # TypeScript type check
   ```

5. Run tests when logic changes touch tested code:

   ```bash
   bun run test
   ```

Other useful commands: `bun run build` (production build), `bun run preview`
(preview the production build locally), `bun run deploy` (build + `wrangler
deploy` to Cloudflare).

See [PRODUCT.md](PRODUCT.md) for product/brand context and
[DESIGN.md](DESIGN.md) for the visual system before doing UI work.

## License

[MIT](LICENSE)

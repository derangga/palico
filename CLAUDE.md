# palico

**What:** An offline-first image toolkit (converter + resizer) that runs entirely
in the browser — files never leave the device.
**Why:** A trustworthy, warm alternative to ad-laden, upload-to-server converter sites.

## Tech Stack

- **Runtime/pkg manager:** Bun. **Never use `npm` or `npx`** — use `bun` / `bun run` / `bunx`.
- **Framework:** TanStack Start + TanStack Router (file-based routes in `src/routes/`, generated `routeTree.gen.ts`).
- **UI:** shadcn components built on Base UI primitives (`src/components/ui/`), Tailwind CSS v4 (`src/styles.css`).
- **Logic:** Effect (TypeScript) for typed effects/errors. Image work runs in Web Workers (`src/workers/`).
- **Deploy:** Cloudflare via `bun run deploy`.

## Commands

```bash
bun install
bun run dev              # dev server on :3000
bun run test             # Vitest
bun run check            # Biome lint + format (lint: `bun run lint`)
bun run tsc --noEmit     # type check
bun run generate-routes  # regenerate the route tree after adding routes
```

## Workflow Rules

- **Branch first:** if on `master`, create a new branch before making changes. Never commit directly to `master`.
- **Before finishing any code change:** `bun run check` and `bun run tsc --noEmit` must both pass with no errors.
- Don't commit or push unless explicitly asked.

## Issue Tracking

This project uses **bd (beads)**, not markdown TODOs or TodoWrite. Run `bd prime` for
the full workflow; use `bd ready` / `bd show <id>` / `bd update <id> --claim` / `bd close <id>`.
Persist durable knowledge with `bd remember`.

## Design Context

Two root files define the product and visual system — read them before doing UI work:

- **[PRODUCT.md](PRODUCT.md):** register, users, purpose, brand personality, anti-references, design principles.
- **[DESIGN.md](DESIGN.md):** the visual system — OKLCH tokens, typography (Nunito single-family, weight + scale for hierarchy), elevation, component specs, and do's/don'ts.

The `/impeccable` skill reads both to keep new UI on-brand.

# palico

**What:** An offline-first image toolkit (converter + resizer) that runs entirely
in the browser — files never leave the device.
**Why:** A trustworthy, warm alternative to ad-laden, upload-to-server converter sites.

## Tech Stack

- **Runtime/pkg manager:** Bun. **Never use `npm` or `npx`** — use `bun` / `bun run` / `bunx`.
- **Framework:** TanStack Start + TanStack Router (file-based routes in `src/routes/`, generated `routeTree.gen.ts`).
- **UI:** shadcn components built on Base UI primitives (`src/components/ui/`), Tailwind CSS v4 (`src/styles.css`).
- **Logic:** Effect (TypeScript) for typed effects/errors. **All business logic outside the UI layer must use Effect** — no raw Promises or try/catch in lib code. Image work runs in Web Workers (`src/workers/`).
- **Errors:** Every error must be a typed, tagged `Schema.TaggedError`. No untyped `throw` or swallowed errors — surface errors on the Effect error channel so call sites can handle them explicitly.
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

## Tooling & Skills

- **Serena first:** Always reach for Serena's semantic tools (`find_symbol`, `get_symbols_overview`, `replace_symbol_body`, `replace_content`) before Read/Edit/grep. Serena is faster and more token-efficient for any code task.
- **fff for search:** Use the `fff` MCP tools (`grep`, `find_files`, `multi_grep`) for file discovery and content search — significantly faster than shell grep.
- **Always use rtk:** Run shell commands through `rtk` (Rust Token Killer) rather than calling the underlying CLI directly — it saves tokens on dev operations.
- **Effect best practices:** Invoke the `/effect-best-practices` skill before writing any Effect code. It enforces correct patterns for services, errors, layers, and Schema.

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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **palico** (1392 symbols, 2834 relationships, 109 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

<!-- gitnexus:end -->

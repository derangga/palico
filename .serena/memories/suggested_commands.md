# Suggested Commands

## Dev

```bash
bun run dev              # dev server on :3000
bun run generate-routes  # regenerate routeTree.gen.ts after adding/renaming routes
bun run preview          # preview production build locally
```

## Build & Deploy

```bash
bun run build            # Vite production build
bun run deploy           # build + wrangler deploy to Cloudflare
```

## Quality Gates (run before finishing any task)

```bash
bun run check            # Biome lint + format (covers both)
bun run tsc --noEmit     # TypeScript type check
bun run test             # Vitest test suite
```

## Individual Lint/Format

```bash
bun run lint             # Biome lint only
bun run format           # Biome format only
```

## Notes

- All commands use `bun`; never substitute `npm run` or `npx`.
- `generate-routes` must be run after any `src/routes/` file additions/renames.

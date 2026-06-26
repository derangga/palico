# Task Completion

Run these before marking any coding task done:

```bash
bun run check        # Biome lint + format — must pass with no errors
bun run tsc --noEmit # TypeScript type check — must pass with no errors
```

Run tests when relevant:

```bash
bun run test         # Vitest — run when logic changes touch tested code
```

If routes were added or renamed:

```bash
bun run generate-routes  # regenerate routeTree.gen.ts
```

## Branch / Commit Rules

- Never commit directly to `master` — branch first.
- Do not commit or push unless explicitly asked by the user.
- `CLAUDE.md` is the authoritative source; these notes summarize its workflow rules.

# Markdown Library (`src/lib/markdown/`)

## Modules

| File | Purpose |
|---|---|
| `actions.ts` | Editor actions (load/save/export) |
| `mermaid.ts` | Lazy-loaded mermaid.js: `loadMermaid`, `renderMermaid`; module-level cached instance (`mermaidRef`) |
| `sample.ts` | Sample markdown content for empty state |
| `storage.ts` | Local persistence of editor content |
| `errors.ts` | Tagged error classes |

## Invariants

- GFM + syntax highlighting + mermaid diagram rendering, all client-side.
- Mermaid is lazy-loaded on demand (not bundled eagerly) since it's only needed when a doc contains a mermaid block.

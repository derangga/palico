# Conventions

## TypeScript

- Strict mode: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`.
- Path aliases: `#/*` and `@/*` both resolve to `./src/*`. Prefer `#/` in source files.
- `verbatimModuleSyntax` enabled — use `import type` for type-only imports.

## Effect & Schema

- Domain types use `Schema.Struct` + `Schema.TaggedError` from `effect/Schema`.
- Error classes are tagged with `_tag` field for discrimination.
- Error union types (e.g. `BackgroundRemovalError`) are `Schema.Union` of tagged error classes.
- Effects compose on the error channel — surface typed errors rather than throwing.
- See beads memory `video-converter-pipeline` and `video-ffmpeg-engine-load` for video-specific Effect patterns.

## Image Domain (`src/lib/image/`)

- Each tool has its own module: `converter.ts`, `resizer.ts`, `background-removal.ts`, `favicon.ts`.
- Shared types in `types.ts` (Effect Schema: `OutputFormat`, `WorkerRequest`, `WorkerResponse`).
- Shared errors in `errors.ts` (tagged error classes).
- Worker communication via `worker-client.ts` (`runImageWorker`, `workerUrl`).
- Converter + resizer use Web Worker + OffscreenCanvas/canvas; background removal uses `@huggingface/transformers` on main thread.

## Biome Style

- Tabs for indentation, double quotes for JS/TS strings.
- Import sorting enabled (`organizeImports: on`).
- Recommended rules; no custom rule overrides beyond defaults.

## Comments

- Default: no comments. Add only when WHY is non-obvious (hidden constraint, subtle invariant, bug workaround).
- No multi-line docstrings or explanatory blocks.

## Routing

- File-based routes; `routeTree.gen.ts` is auto-generated — never hand-edit.
- Run `bun run generate-routes` after any route file changes.

## UI / Design

- Design system tokens and visual rules in `DESIGN.md` (OKLCH tokens, Nunito font, elevation, component specs).
- Product context in `PRODUCT.md` (brand personality, anti-references, design principles).
- Use `/impeccable` skill before any significant UI work.

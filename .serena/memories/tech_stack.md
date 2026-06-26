# Tech Stack

## Runtime & Package Manager

- **Bun** — runtime and package manager. Never use `npm`/`npx`; use `bun` / `bun run` / `bunx`.

## Framework

- **TanStack Start** (`@tanstack/react-start`) + **TanStack Router** — file-based routing under `src/routes/`.
- **React 19** with JSX transform (`react-jsx`).

## Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` plugin. Config lives entirely in `src/styles.css` (no `tailwind.config.*`).
- **shadcn** components built on **Base UI** primitives (`src/components/ui/`).
- **Nunito** variable font (`@fontsource-variable/nunito`) as the single typeface; Inter also installed but not primary.

## Logic / FP

- **Effect** (`effect` ^3.21) for typed effects and errors across all lib modules.
- **Effect Schema** (`Schema.Struct`, `Schema.TaggedError`, `Schema.Union`) used for domain types in `src/lib/image/`.

## Build & Deploy

- **Vite 8** with plugins: `@cloudflare/vite-plugin`, `@tailwindcss/vite`, `@tanstack/react-start/plugin/vite`, `@vitejs/plugin-react`.
- **Cloudflare Workers** deploy target via `wrangler` (`bun run deploy` = build + wrangler deploy).
- `wrangler.jsonc` points `main` at `src/server.ts` (not the TanStack Start auto-detected entry).

## Lint / Format

- **Biome** (`@biomejs/biome` 2.4.5) — single tool for lint + format + import sorting.
  - Indent: tabs. Quote style: double. Scoped to `src/**`, `vite.config.ts`, `index.html`.
  - Excludes `routeTree.gen.ts` and `styles.css`.

## Testing

- **Vitest** with `jsdom` environment and `@testing-library/react`.

## Key Versions (pin-sensitive)

- TypeScript ^6.0.2, target ES2022, `moduleResolution: bundler`.
- `@effect/language-service` plugin enabled in tsconfig.

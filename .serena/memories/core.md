# Core — palico

Offline-first image toolkit (converter, resizer, background removal, favicon generator). Files never leave the device.

## Source Map

```
src/
  routes/           # File-based TanStack Router routes (one per tool + root)
    __root.tsx      # Root layout + sidebar
    index.tsx       # Homepage
    converter.tsx   # Image converter route
    resizer.tsx     # Image resizer route
    background-removal.tsx
    favicon-generator.tsx
  lib/
    image/          # Core image logic — see `mem:image_lib`
    utils.ts        # Shared utils (cn helper)
  workers/
    image-converter.worker.ts  # Web Worker for converter (OffscreenCanvas)
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
- All image processing is client-side; server only serves HTML/assets.

## References

- Image domain logic: `mem:image_lib`
- Tech stack: `mem:tech_stack`
- Code conventions: `mem:conventions`
- Task completion: `mem:task_completion`

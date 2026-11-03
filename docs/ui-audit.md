# UI/UX audit (2026-11-03)

Inspection of all 12 routes at 1440x900 and 390x844, plus a code audit against
`DESIGN.md`, `PRODUCT.md` and the emil-design-eng checklist.

**Not verified:** result, progress and error states with real files; dark mode
(no theme toggle exists in the UI); production-build load behaviour of lazy
routes (all observations are from `bun run dev`).

Contrast numbers below were computed from the OKLCH tokens in `src/styles.css`
(WCAG 2.1 relative luminance). A working OKLCH to contrast script is at
`/private/tmp/claude-501/-Users-sociolla-Documents-playground-palico/5685b2f7-9e90-4d3d-9828-75d7f75e2901/scratchpad/contrast.ts`
(run with `bun`).

## P1: correctness, brand, accessibility

### 1. Nunito never loads
`--font-sans` is `Nunito, ui-sans-serif, ...`, but `@fontsource-variable/nunito`
registers the family as `Nunito Variable`. In the browser `document.fonts`
lists no loaded font faces and `document.fonts.check('16px "Nunito Variable"')`
is false on `/converter`, so the app renders in the system font. This breaks
the One-Family Rule in DESIGN.md, the brand's main typographic signal.

Also in `src/styles.css`: `@import "@fontsource-variable/inter"` is unused,
`@import "tw-animate-css"` appears twice, and `@theme inline` has
`--font-sans: var(--font-sans)` (self-reference). `--font-serif: Lora` is
declared and never loaded.

**Fix:** name the family `"Nunito Variable"` in `--font-sans`, remove the Inter
import, the duplicate import and the self-referencing theme lines. Confirm with
`document.fonts` in the browser.

### 2. Contrast failures
| Pair | Ratio | Needed |
| --- | --- | --- |
| `primary-foreground` (white) on `primary` (primary buttons, 14px) | 3.73 | 4.5 |
| `muted-foreground` on `muted`/`sidebar` (group labels, sidebar footer) | 4.08 | 4.5 |
| `primary` text on `background` (hero word "Offline", large text) | 3.31 | 3.0 (passes) |
| `border` on `card` (dropzone and input boundaries) | 1.49 | 3.0 for UI boundaries |
| `muted-foreground` on `background` | 4.53 | 4.5 (barely) |

`--primary-foreground` is also pure white, which DESIGN.md forbids.

**Fix:** keep hue and chroma, lower `--primary` lightness just enough for 4.5:1
against the chosen foreground (try about L 0.55 with a card-cream foreground,
check the real value), nudge `--muted-foreground` darker so it passes on
`--muted`, and give the dropzone a border that reads at 3:1. Update the colour
values in `DESIGN.md` to match. Check dark mode tokens too.

### 3. Markdown Preview top bar says "Palico"
`PAGE_TITLES` in `src/routes/__root.tsx` has no `/markdown-preview` entry, so
the header falls back to "Palico".

### 4. Home has no way into the tools
`src/routes/index.tsx` is a hero only. On mobile the sidebar is hidden behind
the trigger, so a first-time visitor sees no tool at all. DESIGN.md describes
"Home Tool Tiles" as the signature component; they do not exist.
On desktop the third trust pill wraps alone onto a second line, and the
"Privacy Guaranteed" badge plus three pills make four privacy claims in one
view.

**Fix:** add a tool grid grouped Image / Video / File (same groups and icons as
`app-sidebar.tsx`), warm tokens only, soft `lg` shadow and a small hover lift
gated for hover devices. Trim the pill row so it does not orphan one pill.

### 5. Markdown preview prose is off-palette
`src/components/markdown-preview.tsx` uses `prose prose-neutral`, which gives
near-black headings and cool grey body on the warm cream. Map the typography
plugin variables (`--tw-prose-body`, `--tw-prose-headings`, `--tw-prose-links`,
`--tw-prose-code`, `--tw-prose-pre-bg`, and so on) to the theme tokens, in both
light and dark.

### 6. No `prefers-reduced-motion` handling anywhere
`animate-spin`, tw-animate-css dialog and popover animations, sidebar width
transitions and the sheet all ignore it. DESIGN.md and PRODUCT.md require an
alternative for every animation. Reduced motion means fewer and gentler
animations, not none: keep opacity and colour changes, drop movement.

## P2: consistency and motion

### 7. Page layout is hand-rolled in every route
Each route repeats `mx-auto w-full max-w-3xl px-6 py-10` plus an `h1` and a
description. Widths drift: `3xl` (converter, resizer, video, favicon, background
removal, office), `5xl` (pdf-merge, pdf-split), `6xl` (video-cutter at wide
sizes), full width (markdown, diff). Extract `PageShell` and `PageHeader` with
`narrow | wide | full` widths and use them everywhere.

### 8. The top bar repeats the page title
The header shows "Image Converter" and the page `h1` shows it again directly
below. Make the top bar a breadcrumb ("Image / Converter") or show the group
name only, so the title appears once.

### 9. Seven near-identical dropzones
`converter`, `resizer`, `pdf-split`, `video-converter`, `video-cutter` each have
a `dropzone.tsx`; `pdf-merge.tsx` and `background-removal.tsx` inline their own.
None has a drag-over state (`onDragOver` only calls `preventDefault`). The zone
is a small 176px box with a faint dashed border, and only the inner button
opens the file picker.

**Fix:** one shared `Dropzone` with: a drag-over state (border and background
change, short transition), the whole zone clickable and keyboard operable, the
accepted formats and limits shown inside it, and a real border contrast. Keep a
keyboard route to file selection (PRODUCT.md requirement).

### 10. Off-palette success colour
`emerald-600` is used for the "done" check in `converter/status-badge.tsx`,
`video-converter/status-badge.tsx`, `office-to-pdf/file-row.tsx`,
`resizer/result-card.tsx`, and in `diff-view.tsx` (`emerald-500/600`).
`video-converter/cancel-dialog.tsx` uses `bg-destructive text-white`, which is
different from the soft destructive button variant and uses pure white.
DESIGN.md says everything is grounded in the warm tokens.

**Fix:** add a `--success` token (warm, low chroma, olive-leaning, with a dark
variant and a `--color-success` theme mapping) and replace the hardcoded
greens. Use the destructive `Button` variant in the cancel dialog.

### 11. Motion curves and press feedback
- `ui/sidebar.tsx` animates width and position with `ease-linear` (200ms).
  Linear is for constant motion; use a strong ease-out or the drawer curve.
- `ui/sheet.tsx` uses a generic `ease-in-out`.
- `ui/button.tsx` uses `transition-all` and a 1px `translate-y` on press.
  List the properties and use `scale(0.97)` on `:active` (100-160ms).
- Define `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` and
  `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` once in `styles.css` and use
  them. Keep UI animations under 300ms. Never animate keyboard-driven actions.

### 12. Engine consent modal opens on every visit
Video Cutter, Video Converter and Remove Background open a blocking
"Download the ... engine" dialog as soon as the route loads, over a page that is
already showing a "Preparing ... Checking for a cached engine" card. Choosing
"Maybe later" leaves a clean inline "Enable ..." card, which is the better
state. Show that inline card as the default, keep the dialog for the click on
"Enable", and do not show two loading states at once.

## P3: polish

### 13. Lazy routes show a bare spinner
`markdown-preview` and `diff-viewer` use `Suspense` with a centred spinner. In
dev the page looks blank for 2 to 6 seconds. Use a page-shaped skeleton (the
`Skeleton` component exists) that matches the final layout so nothing jumps.
Confirm the real delay on a production build before judging how much it matters.

### 14. Mobile tap targets
Sidebar menu items are 32px high and `size="sm"` buttons are 32px. Raise the
sidebar items to about 40-44px on touch sizes.

### 15. Home hero image
`src/routes/index.tsx` crops the illustration with `scale-125 object-cover`
and, on mobile, the 4/5 aspect pushes it below the fold and leaves little
content above it. Use a shorter aspect on small screens.

## Work streams

Three streams with no overlapping files, run in parallel:

| Stream | Items | Files |
| --- | --- | --- |
| A. Foundation and tokens | 1, 2, 3, 5, 6, 8, 10, 11, 14 | `src/styles.css`, `DESIGN.md`, `ui/button.tsx`, `ui/sidebar.tsx`, `ui/sheet.tsx`, `ui/alert-dialog.tsx`, `routes/__root.tsx`, `markdown-preview.tsx`, status-badge / result-card / file-row / `diff-view.tsx` / `cancel-dialog.tsx` |
| B. Home | 4, 15 | `src/routes/index.tsx` (new tile component under `src/components/` if needed) |
| C. Shell, dropzone, engine, loading | 7, 9, 12, 13 | `src/routes/*` (except `__root.tsx`, `index.tsx`), every `dropzone.tsx`, `use-engine-gate` hook, new shared components |

Constraints for every stream: Bun only, no commits, `bun run check` and
`bun run tsc --noEmit` pass for the files touched, follow `DESIGN.md`, and do
not add motion beyond what conveys state.

## Status (2026-11-03, after the three streams)

Implemented on `chore/ui-ux-audit`, uncommitted: items 1-15 except where noted
below. `bun run tsc --noEmit` and `bun run test` (37 tests) pass. Verified by
screenshot at 1440x900 and 390x844: home, converter, video-cutter and the
shared shell; stream agents also checked resizer, pdf-merge, background-removal
and markdown-preview.

### Follow-ups
- **Dropzone border.** Shared `Dropzone` uses `border-foreground/60` (3.29:1).
  Stream A also darkened `--input` to 3:1. Pick one and use it for both.
- **Remove Background** still has its own empty-state picker instead of the
  shared `Dropzone`.
- **Duplicated tool lists.** `app-sidebar.tsx`, `components/home/tools.ts` and
  the breadcrumb group map in `routes/__root.tsx` each hold the tool grouping.
  Export one list and use it in all three.
- **Home hero.** The illustration card has a large empty area left of the
  character on desktop; the Image group leaves one tile alone on its second
  row. Tune `object-position` and grid columns.
- **Contrast leftovers.** `text-primary` on cream is about 4.1:1 (fine for the
  hero word and icons, not small text). Muted text on the accent-tan fill is
  about 3.1:1.
- **Not verified:** dark mode (no toggle), `prefers-reduced-motion` in a
  browser, hover and press visuals on tiles, drop and picker with real files,
  engine download and "Preparing" states, Office to PDF, Video Converter,
  Split PDF, Favicon and Diff pages in the browser, production-build load of
  lazy routes.
- **Tooling.** `bun run check` fails on 37 Biome errors, all in shadcn
  `ui/*.tsx`, `biome.json`, `lib/utils.ts` and `router.tsx` (format and import
  order). None are in files written by this work. Decide whether to format
  `ui/*` or exclude it in `biome.json`.

# Colourful palico: Catppuccin, new mascot, motion (exploration)

Status: exploration only. No app source was changed. Mock board:
`docs/assets/palette-mock.png` (source: `docs/assets/palette-mock.html`, open it
in a browser). It shows the same home screen in three palettes.

## 0. This overrides the current design rules

`DESIGN.md` and `PRODUCT.md` currently say: one warm caramel accent, no
off-palette colour, brick red only for errors, "don't over-animate", warmth as
the differentiator. A colourful, animated Catppuccin theme breaks all of those on
purpose. If we go ahead, both files get rewritten first so later work (and
agents) follow the new rules instead of the old ones. The token tweaks from the
first audit (caramel primary, `--success` olive) are replaced by this.

## 1. The new logo file

`Chibi Cat Adventurer with Whimsical Hammer.png` (repo root, untracked).

- 1536x1024 RGBA, 2.1 MB. It is a **clean cutout**: it looks right on Latte
  `#eff1f5`, cream and Mocha `#1e1e2e` (checked on all three, see the mock).
  There is no dark halo.
- Its own colours already sit in the Catppuccin family: blue hat, lavender
  scarf, pink-mauve hammer, green plants, yellow coat. The old orange-only
  artwork did not fit; this one does.
- The character fills only part of the canvas. Content bounding box is
  1131x992 at (349, 15). Crop to it and the image is nearly square.
- Weight: a 560px WebP of the cropped art is about 100 KB, against the current
  2.7 MB `public/palico.png` served on the home page. Make 1x/2x WebP (and
  optionally AVIF) variants. This is a free speed win and should be done
  regardless of the theme.
- It is an illustration, not a mark. Small sizes need a **separate face-only
  crop** (sidebar logo, favicons, apple-touch, android-chrome 192/512,
  `logo192/512`). Currently the sidebar logo is a drawn icon and the favicons
  are the old art.
- `public/site.webmanifest` has `theme_color` and `background_color` of
  `#ffffff` (pure white). Set both to the chosen base colour.

## 2. Palette: three options

Catppuccin has Latte (light) plus Frappe, Macchiato and Mocha (dark). Mocha is
the recommended dark flavour. The Tailwind v4 package is
`@catppuccin/tailwindcss`: `@import "@catppuccin/tailwindcss/mocha.css"` gives
`--color-ctp-*` tokens and flavour classes (`.latte`, `.mocha`). The repo pins
exact dependency versions (last commit), so pin it too.

| | A. True Latte (+ Mocha) | B. Warm cream + Catppuccin accents | C. Mocha only |
| --- | --- | --- | --- |
| Surfaces | Latte base `#eff1f5`, cool lavender-grey | Current warm cream | Mocha base `#1e1e2e` |
| Accents | Catppuccin | Catppuccin | Catppuccin |
| Fidelity to Catppuccin | Full, matches editors and the wider ecosystem | Partial, accents only | Full |
| Brand "warmth" | Lost on surfaces, kept by the yellow coat in the mascot | Kept | Different mood, cosy-dark |
| Dark mode | Same system, Mocha via a toggle | Needs its own dark base | It is the theme |
| Risk | Reads cooler and more "dev tool" | Not recognisably Catppuccin | No light theme, offline users on bright screens |

**Recommendation: A, with a Latte/Mocha toggle.** It is the real Catppuccin
look people expect, the mascot looks best against it, and the toggle gives the
site a playful moment (see motion). B is the pick if keeping the cream is more
important than being faithful to Catppuccin.

### Contrast reality (WCAG AA = 4.5:1 text, 3:1 UI boundary)

Computed from the official hex values.

**Latte, accent as text on `base`, or `base` text on the accent:**

| Accent | Ratio | Usable as text / button fill? |
| --- | --- | --- |
| Red `#d20f39` | 4.80 | Yes |
| Mauve `#8839ef` | 4.79 | Yes (best primary) |
| Blue `#1e66f5` | 4.34 | Just below; fine for large text, borderline for 14px |
| Teal | 3.31 | Decoration and icons only |
| Green | 2.96 | Decoration and icons only |
| Lavender | 2.81 | Decoration and icons only |
| Sapphire | 2.78 | Decoration and icons only |
| Peach | 2.64 | Decoration and icons only |
| Sky | 2.47 | Decoration and icons only |
| Pink | 2.34 | Decoration and icons only |
| Yellow | 2.31 | Decoration and icons only |

Other Latte pairs: `text` on `base` 7.06 (fine). `subtext0` on `base` 4.37 and
on `mantle` 4.06 (use `subtext1` `#5c5f77` for small text instead). `surface1`
border on `base` only 1.61, `overlay2` is 3.49, so input and dropzone borders
need `overlay2`-level colour.

**Rule that follows:** in Latte only Mauve, Red and (large) Blue carry text or
white-text buttons. Every other accent is a fill, a tint (`color-mix` with the
card colour) or an icon, with `text`-coloured labels on top, exactly as the mock
tiles do. Status pills use tinted fill + coloured dot + `text` label.

**Mocha:** every accent passes as text on `base` (7.1 to 12.9). `text` on
`base` is 11.3, `subtext0` 7.4. Mocha is easy; Latte is where care is needed.

## 3. Colour roles (so "colourful" stays meaningful)

- **Primary action:** Mauve (`#8839ef` Latte, `#cba6f7` Mocha). It appears in
  the logo's lavender-blue hat family and is the strongest AA-safe Latte accent.
  Alternative: Blue, to match the hat.
- **One accent per tool category** (chip colour, tile, page-header chip, sidebar
  icon, focus-adjacent details). The page-header chip was later removed because
  the breadcrumb already names the category:
  - Image: Mauve and Pink
  - Video: Peach and Yellow
  - File: Teal and Green
- **Status keeps real meaning:** success Green, error Red, warning Yellow/Peach,
  info Sapphire/Sky. The old "red only for destruction" rule loosens to "red
  only for errors and destruction", because other colours are now common.
- **Large surfaces stay quiet** (Base, Mantle, Crust, Surface0). Colour lives in
  small, repeated spots: chips, pills, underlines, progress, hover shadows.
  Colourful but not noisy: at most one saturated colour per component.
- Syntax highlighting (`hljs-*` in `styles.css`) and Mermaid get Catppuccin
  colours too (Mermaid has a Catppuccin theme variable set; the code already
  switches on the `dark` class). Sonner toasts follow the theme.

### shadcn token mapping (Latte / Mocha)

| Token | Latte | Mocha |
| --- | --- | --- |
| `--background` | base | base |
| `--card`, `--popover` | mantle | surface0 |
| `--sidebar` | crust | mantle |
| `--foreground` | text | text |
| `--muted-foreground` | subtext1 | subtext0 |
| `--border` | surface1 | surface1 |
| `--input` | overlay2 (3:1) | overlay0 |
| `--primary` / fg | mauve / base | mauve / base |
| `--secondary` | surface0 | surface1 |
| `--accent` | surface1 | surface1 |
| `--destructive` | red | red |
| `--success` | green (fill) | green |
| `--ring` | mauve | mauve |

The existing `@custom-variant dark (&:is(.dark *))` can keep working if the
toggle puts `.dark` and `.mocha` on `<html>` together. `next-themes` 0.4.6 is
already in `package.json` and unused. It handles persistence and the no-flash
script; it needs the Start/SSR `<html>` to suppress hydration warnings.

## 4. Motion: playful, but earn it

Principle from the design-engineering rules: animate in proportion to how rarely
it is seen. Nothing used hundreds of times a day moves.

| Frequency | Where | Treatment |
| --- | --- | --- |
| Rare, first look | Home hero, empty states, "all done" | Can delight |
| Occasional | Dialogs, toasts, file-added, finished | Standard, under 300ms |
| Constant | Sidebar nav, buttons, inputs, keyboard actions | Minimal: press scale, colour only |

Concrete ideas, cheapest first. All are CSS transitions or keyframes unless
noted; **no new dependency is needed** (`motion` is not installed). Every one
has a `prefers-reduced-motion` version that keeps colour and opacity and drops
movement.

1. **Mascot idle (home only).** Slow bob (translateY about 6px, 5 to 6s,
   ease-in-out) plus a very small tilt; paused when the tab is hidden. Whole-
   image transform only, because the art is one flat layer.
2. **Tile hover.** Lift 2px, a coloured bottom shadow in the tile's accent
   (the mock's `0 4px 0` shadow, squishes to 1px on press), icon chip does one
   small tilt. 160 to 200ms, `cubic-bezier(0.23, 1, 0.32, 1)`.
3. **First-load stagger on the home grid.** 40ms steps, opacity + 8px rise,
   once per session, never blocks clicks.
4. **Chunky buttons.** The primary button gets the "pressable" bottom edge that
   drops on `:active` plus `scale(0.97)`. Reads as a toy, matches the "friendly
   desk toy" brief.
5. **Dropzone drag-over.** Border goes solid and accent-coloured, the upload
   icon hops once, a faint accent glow. On drop, file rows arrive with a short
   pop (scale 0.96 to 1 + fade), not a long list animation.
6. **Progress.** Candy-stripe fill moving at constant speed (linear is correct
   here), the chip colour of the tool category.
7. **Done moment.** Check draws itself (stroke-dashoffset, 250ms), the row gets
   a green tint that fades, and a tiny burst of Catppuccin-coloured dots (12
   absolutely-positioned spans, 400ms, once). Toast text gets a friendlier
   voice. Keep it to completion of a user job, not every state change.
8. **Theme toggle.** Sun/moon swap with a circular clip-path reveal from the
   button, via the View Transitions API where supported, instant elsewhere.
   Rare action, so it can afford a flourish.
9. **Sidebar active pill.** A background that slides between items (transform
   only, 200ms) instead of snapping. Cheap and feels alive without adding noise.
10. **Route change.** 120ms crossfade of the page content only. No slides.
11. **Logo in the sidebar.** Face crop winks or tilts on hover (hover-capable
    devices only).

Needs new art, not code (ask before relying on them):
- A **hammer swing** on the "converting" state, a fish dangling on loading. The
  current PNG is one layer. Needs the hammer and rod as separate transparent
  layers, or a short sprite sheet.
- **Extra poses** in the same style for empty, success and error states
  (happy jump, confused shrug, sleeping). Without these, empty/error screens
  reuse the same pose.

Spring physics (cursor-follow tilt on the hero, drag-to-reorder in Merge PDFs)
would justify adding `motion`. Not needed for anything above, so skip unless you
want the hero to track the cursor.

Performance guardrails: animate only `transform` and `opacity`; keep
`backdrop-filter` blur on small areas (the sticky header already uses it);
looping animations only on the home page; stop them when `document.hidden`.

## 5. Work breakdown (if approved)

1. **Rules first.** Rewrite `DESIGN.md` and `PRODUCT.md` for the new direction.
2. **Assets.** Crop and export hero WebP/AVIF (1x, 2x), face crop, favicon set
   (16, 32, 64, ico, apple-touch, android 192/512, `logo192/512`), OG image,
   fix manifest colours. Replace `public/palico.png`.
3. **Tokens.** Install the pinned package, map the shadcn variables (section
   3), add `next-themes` and the toggle in the header, recolour `hljs`, Mermaid
   and Sonner. Verify every pair against the contrast table.
4. **Components.** Category accents on tiles, sidebar, page headers, status
   chips (replace `--success` and the emerald leftovers), chunky buttons,
   dropzone, progress.
5. **Motion.** Items 1 to 11 above, each behind the reduced-motion rules.
6. **Home.** New hero layout around the cropped mascot, tile grid with
   category colours (also fixes the lone fourth Image tile).
7. **QA.** Light and dark at 1440 and 390; keyboard focus on every coloured
   control; contrast script over all tokens; Lighthouse on the home page for
   image weight.

Streams 2, 3 and 4 touch different files and can run in parallel after 1.

## 6. Decisions (2026-11-03)

1. Palette: **A**, true Latte with a Mocha toggle.
2. Primary accent: **Mauve**.
3. Per-category accent colours: as proposed in section 3.
4. Motion level: **playful**, all 11 ideas, each with a reduced-motion version.
5. Mascot art: **single image only**. No hammer-swing or extra poses; empty and
   error states reuse the one pose, and loading states use whole-image motion.

Next step is the work breakdown in section 5, starting with the `DESIGN.md` and
`PRODUCT.md` rewrite.

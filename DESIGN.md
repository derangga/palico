---
name: palico
description: Warm, offline-first image toolkit that feels like a friendly desk toy
colors:
  primary: "oklch(0.618 0.0778 65.5444)"
  primary-dark: "oklch(0.7264 0.0581 66.6967)"
  caramel-deep: "oklch(0.4851 0.057 72.6827)"
  cream-bg: "oklch(0.9582 0.0152 90.2357)"
  card-cream: "oklch(0.9914 0.0098 87.4695)"
  espresso-ink: "oklch(0.376 0.0225 64.3434)"
  muted-surface: "oklch(0.9239 0.019 83.0636)"
  muted-ink: "oklch(0.5391 0.0387 71.1655)"
  sand-secondary: "oklch(0.8846 0.0302 85.5655)"
  accent-tan: "oklch(0.8348 0.0426 88.8064)"
  warm-border: "oklch(0.8606 0.0321 84.5881)"
  brick-destructive: "oklch(0.5471 0.1438 32.9149)"
  espresso-night: "oklch(0.2747 0.0139 57.6523)"
typography:
  display:
    fontFamily: "Londrina Shadow, cursive"
    fontSize: "clamp(1.875rem, 5vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "normal"
  headline:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "0px"
  md: "0.125rem"
  lg: "0.25rem"
  xl: "0.5rem"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.card-cream}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.625rem"
  button-primary-hover:
    backgroundColor: "{colors.caramel-deep}"
    textColor: "{colors.card-cream}"
  button-outline:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.md}"
  button-ghost-hover:
    backgroundColor: "{colors.muted-surface}"
    textColor: "{colors.espresso-ink}"
  card:
    backgroundColor: "{colors.card-cream}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.cream-bg}"
    textColor: "{colors.espresso-ink}"
    rounded: "{rounded.md}"
    height: "2.25rem"
---

# Design System: palico

## 1. Overview

**Creative North Star: "The Friendly Desk Toy"**

palico is a delightful little utility that lives on your desk — a warm,
personable image toolkit you reach for without thinking. It is the opposite of
the ad-laden converter sites it competes with: no banner ads, no fake download
buttons, no cold enterprise chrome. The whole surface is bathed in warm cream
(`oklch(0.9582 0.0152 90.2357)`), text is a soft espresso brown rather than
hard black, corners are barely rounded, and shadows are gentle and warm-tinted.
The playful Londrina Shadow display font gives it character without tipping
into childishness; everything else is the friendly, highly legible Nunito.

The system explicitly rejects three things. **Sketchy converter sites**: there
are no dark patterns, ambiguous buttons, or upload-to-server anxieties — the
interface should *feel* private and on-device. **Cold enterprise SaaS**: no
navy-and-gray, no soulless density; warmth is the differentiator. **Flashy
over-animation**: motion conveys state (a file processing, a control
toggling), never spectacle.

Warmth is carried by the cream surfaces, the caramel-brown accent, and the
display typography — not by gratuitous decoration. The tool disappears into the
task; personality is reserved for moments (the home hero, empty states), not
sprayed across every control.

**Key Characteristics:**
- Warm cream surfaces with espresso-brown ink, never pure white or pure black.
- A single muted caramel accent — used for actions and state, not decoration.
- Playful Londrina Shadow display, friendly Nunito everywhere else.
- Tight, near-square radii (0–4px) and soft, warm-tinted shadows.
- Privacy and trust are felt through restraint and clarity, not claimed in fine print.

## 2. Colors

A warm, low-chroma palette anchored in the 64–90° hue band (caramel/sand/cream), with a single brick red reserved for destruction.

### Primary
- **Muted Caramel** (`oklch(0.618 0.0778 65.5444)`): The one accent. Primary buttons, active/selected states, focus rings, links. In dark mode it lifts to a lighter caramel (`oklch(0.7264 0.0581 66.6967)`) for contrast.
- **Deep Caramel** (`oklch(0.4851 0.057 72.6827)`): The hover/pressed shade of the accent and the darkest chart step.

### Secondary
- **Warm Sand** (`oklch(0.8846 0.0302 85.5655)`): Secondary buttons and quieter fills that still need to read as interactive.
- **Soft Tan** (`oklch(0.8348 0.0426 88.8064)`): Accent surface for hovered rows, highlighted panels, sidebar accents.

### Neutral
- **Warm Cream** (`oklch(0.9582 0.0152 90.2357)`): The body background. The signature surface — the page IS cream.
- **Card Cream** (`oklch(0.9914 0.0098 87.4695)`): A near-white lift for cards, popovers, and inputs, one step brighter than the body.
- **Espresso Ink** (`oklch(0.376 0.0225 64.3434)`): Primary text. A deep warm brown, never `#000`.
- **Muted Ink** (`oklch(0.5391 0.0387 71.1655)`): Secondary text, captions, placeholders. **Verify ≥4.5:1 against cream before using on body copy** — this is the palette's contrast risk.
- **Muted Surface** (`oklch(0.9239 0.019 83.0636)`): Ghost-button hover, sidebar background, subtle panel fills.
- **Warm Border** (`oklch(0.8606 0.0321 84.5881)`): All borders, inputs, and dividers.

### Tertiary
- **Brick Red** (`oklch(0.5471 0.1438 32.9149)`): Destructive actions and errors only. The only high-chroma color in the system; its rarity is the warning.

### Named Rules
**The One Warm Accent Rule.** There is exactly one accent — Muted Caramel. It marks actions, selection, and focus. It is never used for decoration, and never appears on inactive states. If a screen has caramel in more than a few places, something non-actionable is wearing the action color.

**The No-Pure-Black, No-Pure-White Rule.** Text is Espresso Ink, never `#000`. Surfaces are Cream or Card Cream, never `#fff`. Pure neutrals read as cold and break the warmth that is the whole point.

**The Stoplight Rule.** Brick Red is reserved for destruction and error. Seeing it anywhere else is a bug.

## 3. Typography

**Display Font:** Londrina Shadow (with `cursive` fallback)
**Body Font:** Nunito Variable (with `ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** IBM Plex Mono (for any numeric/dimension readouts)

**Character:** Londrina Shadow is a playful, slightly theatrical display face — it carries all of palico's personality and appears sparingly (the home hero tagline). Nunito is rounded, warm, and exceptionally legible at small sizes, which makes it right for a dense tool UI. The pairing contrasts on a clear axis (decorative display vs. humanist sans), so they never compete.

### Hierarchy
- **Display** (Londrina Shadow, 400, `clamp(1.875rem, 5vw, 3rem)`, lh 1.05): Hero taglines and signature brand moments only. Never in UI labels, buttons, or data.
- **Headline** (Nunito, 700, 1.5rem, lh 1.2): Page/section titles.
- **Title** (Nunito, 600, 1.125rem, lh 1.3): Card and panel headers.
- **Body** (Nunito, 400, 0.875rem, lh 1.5): Default UI and prose text. Cap prose at 65–75ch.
- **Label** (Nunito, 600, 0.875rem, lh 1.4): Buttons, form labels, nav items, badges.

### Named Rules
**The Display-Stays-Home Rule.** Londrina Shadow is for brand moments, never for functional UI. A button, a table header, or a form label rendered in the display font is always wrong — it belongs to Nunito.

**The Fixed-Scale Rule.** Outside the hero, type sizes are fixed rem values, not fluid clamps. Users view this tool at a consistent DPI; a heading that shrinks inside a panel looks broken, not responsive.

## 4. Elevation

palico is mostly flat with soft, warm-tinted shadows for genuine lift (cards, popovers, dropdowns, the home tool tiles). Shadows are not decorative — they signal that a surface floats above the page or has been raised by interaction. Every shadow uses a warm brown shadow color (`hsl(28 13% 20%)`) at low opacity, never a neutral gray, so even depth stays warm. If a shadow reads as cool or hard-edged, the color or blur is wrong.

### Shadow Vocabulary
- **xs / sm** (`2px 3px 5px hsl(28 13% 20% / 0.06–0.12)`): Resting lift for outline buttons, inputs, small chips.
- **md / lg** (`2px 3px 5px + 2px 4px 6px hsl(28 13% 20% / 0.12)`): Cards, the home tool tiles, raised panels.
- **xl** (`2px 8px 10px hsl(28 13% 20% / 0.12)`): Popovers, dropdowns, sheets, dialogs.

### Named Rules
**The Warm-Shadow Rule.** Every shadow is tinted warm brown (`hsl(28 13% 20%)`), never neutral gray or black. A gray shadow on a cream surface is a tell that depth was added by reflex.

## 5. Components

Built on Base UI primitives with a shadcn-derived structure. The feel across all of them: **soft and approachable** — gentle near-square corners, warm fills, light shadows, never sterile.

### Buttons
- **Shape:** Near-square, `rounded-md` (0.125rem / ~2px); small/icon sizes go slightly rounder (up to 10px). Default height 2.25rem (`h-9`), compact horizontal padding (`px-2.5`).
- **Primary:** Muted Caramel fill, Card Cream text. Hover deepens toward Deep Caramel (the build uses `bg-primary/80`).
- **Outline:** Cream background, Warm Border, subtle `xs` shadow; hover fills Muted Surface.
- **Secondary:** Warm Sand fill, Espresso text.
- **Ghost:** Transparent; hover fills Muted Surface.
- **Destructive:** Tinted Brick Red (`destructive/10`) with Brick Red text — soft, not a solid red slab.
- **Focus / Active:** Focus-visible shows a 3px caramel ring (`ring-ring/50`) plus border shift; active nudges down 1px for tactile press.

### Cards / Containers
- **Corner Style:** `rounded-lg` (0.25rem).
- **Background:** Card Cream, one step brighter than the body.
- **Shadow Strategy:** `md`/`lg` warm shadow (see Elevation). No nested cards — ever.
- **Border:** Warm Border, 1px.
- **Internal Padding:** 1.5rem (`lg`).

### Inputs / Fields
- **Style:** Cream background, 1px Warm Border, `rounded-md`, height 2.25rem.
- **Focus:** 3px caramel ring + border shift to the ring color.
- **Error / Disabled:** `aria-invalid` shows a Brick Red border + red ring; disabled drops to 50% opacity with pointer-events off.

### Navigation
- **Style:** Collapsible left sidebar (Base UI sidebar) on Muted Surface, plus a sticky top header with a backdrop-blur cream bar (`bg-background/70 backdrop-blur-md`). Active item carries the caramel accent; hover fills Soft Tan / Muted Surface. On mobile the sidebar collapses behind a `SidebarTrigger`.
- **Typography:** Nunito Label (600, 0.875rem).

### Home Tool Tiles (signature component)
- Rounded-2xl icon tiles linking to each tool, with a soft `lg` shadow and a gentle `-translate-y-0.5` lift on hover. **Known drift:** the current tiles hardcode `orange-*`/`emerald-*` colors and rely on `drop-shadow` text over a background image — both should be re-grounded in the warm token palette and checked for AA contrast.

## 6. Do's and Don'ts

### Do:
- **Do** surface the offline/on-device guarantee as a first-class part of the interface (the home trust badges) — privacy is visible, not buried.
- **Do** keep one job, few clicks per tool; sensible defaults, advanced options tucked away until wanted.
- **Do** use Espresso Ink on Cream/Card Cream for text, and verify Muted Ink hits ≥4.5:1 before using it for body copy.
- **Do** tint every shadow warm brown (`hsl(28 13% 20%)`).
- **Do** reserve Londrina Shadow for brand moments and keep all functional UI in Nunito.
- **Do** give every control a real focus-visible state (3px caramel ring) and a `prefers-reduced-motion` alternative.

### Don't:
- **Don't** evoke ad-heavy converter sites: no fake/disguised download buttons, no upload-to-server ambiguity, no popups or dark patterns.
- **Don't** drift into cold enterprise SaaS: no navy-and-gray, no pure-white/pure-black, no soulless density.
- **Don't** over-animate — motion conveys state (processing, toggling, reveal), never spectacle. No orchestrated page-load sequences.
- **Don't** use Brick Red for anything but destruction and error.
- **Don't** hardcode off-palette colors like `orange-300`/`emerald-300` (as the current home tiles do) — ground everything in the warm tokens.
- **Don't** nest cards, or use a `border-left`/`border-right` colored stripe as a card or alert accent.
- **Don't** put the display font in buttons, labels, or data.

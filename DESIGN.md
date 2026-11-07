---
name: palico
description: Friendly, offline-first file toolkit in Catppuccin Latte and Mocha, with playful motion and a mascot
colors:
  base: "#eff1f5"
  mantle: "#e6e9ef"
  crust: "#dce0e8"
  surface0: "#ccd0da"
  surface1: "#bcc0cc"
  overlay2: "#7c7f93"
  text: "#4c4f69"
  subtext1: "#5c5f77"
  base-dark: "#1e1e2e"
  mantle-dark: "#181825"
  crust-dark: "#11111b"
  surface0-dark: "#313244"
  surface1-dark: "#45475a"
  overlay0-dark: "#6c7086"
  text-dark: "#cdd6f4"
  subtext0-dark: "#a6adc8"
  mauve: "#8839ef"
  mauve-dark: "#cba6f7"
  pink: "#ea76cb"
  pink-dark: "#f5c2e7"
  peach: "#fe640b"
  peach-dark: "#fab387"
  yellow: "#df8e1d"
  yellow-dark: "#f9e2af"
  teal: "#179299"
  teal-dark: "#94e2d5"
  green: "#40a02b"
  green-dark: "#a6e3a1"
  red: "#d20f39"
  red-dark: "#f38ba8"
  sapphire: "#209fb5"
  sapphire-dark: "#74c7ec"
  sky: "#04a5e5"
  sky-dark: "#89dceb"
  blue: "#1e66f5"
  blue-dark: "#89b4fa"
  lavender: "#7287fd"
  lavender-dark: "#b4befe"
  flamingo: "#dd7878"
  flamingo-dark: "#f2cdcd"
typography:
  display:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 5vw, 3rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Nunito Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.mauve}"
    textColor: "{colors.base}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    padding: "0 0.75rem"
  button-outline:
    backgroundColor: "{colors.base}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
  button-ghost-hover:
    backgroundColor: "{colors.surface0}"
    textColor: "{colors.text}"
  card:
    backgroundColor: "{colors.mantle}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  input:
    backgroundColor: "{colors.base}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    height: "2.25rem"
---

# Design System: palico

## 1. Overview

**Creative North Star: "The Friendly Desk Toy"**

palico is a small, playful utility that lives on your desk: an offline file
toolkit you reach for without thinking. It is the opposite of the ad-laden
converter sites it competes with: no banner ads, no fake download buttons, no
cold enterprise chrome. The product keeps that brief, and now expresses it with
colour and a mascot instead of cream and caramel.

The theme is **Catppuccin**. Light mode is **Latte**, dark mode is **Mocha**,
switched with a toggle in the header. Surfaces are calm and slightly cool
(Latte Base `#eff1f5`, Mocha Base `#1e1e2e`). Colour lives in small, repeated
spots: tool chips and tiles, status pills, progress bars, underlines and hover
edges. Mauve is the single primary action colour. Each tool category has its
own accent pair so people can tell Image, Video & Audio, File, Color and Developer tools apart at
a glance. Typography stays one voice, Nunito Variable, with weight and scale
carrying hierarchy.

The mascot, **Palico** (a chibi cat adventurer with a hammer), carries the
personality at rare moments: the home hero, the sidebar logo, the favicon.
Tools themselves stay quiet and fast.

The system explicitly rejects three things. **Sketchy converter sites**: no
dark patterns, ambiguous buttons or upload-to-server anxiety; the interface
should feel private and on-device. **Cold enterprise SaaS**: no navy-and-gray
density; friendliness is the differentiator. **Motion that gets in the way of
the task**: playfulness is earned by rarity (see Motion).

**Key Characteristics:**
- Catppuccin Latte and Mocha, one token set, switched by theme toggle.
- Mauve is the one primary action colour. Category accents are for identity, not actions.
- Large surfaces stay quiet; colour sits in small, repeated spots.
- Real status colours (green done, red error, yellow or peach warning, sapphire or sky info).
- Friendly radii, neutral low-opacity shadows, chunky pressable primary buttons.
- One typeface, Nunito Variable.
- Playful motion on rare moments, minimal motion on frequent ones, and a reduced-motion version of everything.

## 2. Colors

Official Catppuccin values. Light is Latte, dark is Mocha. Never invent
off-palette colours or hardcode Tailwind colours such as `orange-300` or
`emerald-300`; use the tokens.

### Neutrals (surfaces and text)

| Role | Latte | Mocha |
| --- | --- | --- |
| Base (page) | `#eff1f5` | `#1e1e2e` |
| Mantle | `#e6e9ef` | `#181825` |
| Crust | `#dce0e8` | `#11111b` |
| Surface0 | `#ccd0da` | `#313244` |
| Surface1 | `#bcc0cc` | `#45475a` |
| Surface2 | `#acb0be` | `#585b70` |
| Overlay0 | `#9ca0b0` | `#6c7086` |
| Overlay1 | `#8c8fa1` | `#7f849c` |
| Overlay2 | `#7c7f93` | `#9399b2` |
| Subtext0 | `#6c6f85` | `#a6adc8` |
| Subtext1 | `#5c5f77` | `#bac2de` |
| Text | `#4c4f69` | `#cdd6f4` |

### Accents

| Accent | Latte | Mocha |
| --- | --- | --- |
| Rosewater | `#dc8a78` | `#f5e0dc` |
| Flamingo | `#dd7878` | `#f2cdcd` |
| Pink | `#ea76cb` | `#f5c2e7` |
| Mauve | `#8839ef` | `#cba6f7` |
| Red | `#d20f39` | `#f38ba8` |
| Maroon | `#e64553` | `#eba0ac` |
| Peach | `#fe640b` | `#fab387` |
| Yellow | `#df8e1d` | `#f9e2af` |
| Green | `#40a02b` | `#a6e3a1` |
| Teal | `#179299` | `#94e2d5` |
| Sky | `#04a5e5` | `#89dceb` |
| Sapphire | `#209fb5` | `#74c7ec` |
| Blue | `#1e66f5` | `#89b4fa` |
| Lavender | `#7287fd` | `#b4befe` |

### Contrast (WCAG AA: 4.5:1 text, 3:1 UI boundary)

**Latte: accent as text on Base, or Base text on the accent fill.**

| Accent | Ratio | Use as text or button fill? |
| --- | --- | --- |
| Red `#d20f39` | 4.80 | Yes |
| Mauve `#8839ef` | 4.79 | Yes (primary) |
| Blue `#1e66f5` | 4.34 | Large text only; borderline at 14px |
| Teal | 3.31 | Fills, tints and icons only |
| Green | 2.96 | Fills, tints and icons only |
| Lavender | 2.81 | Fills, tints and icons only |
| Sapphire | 2.78 | Fills, tints and icons only |
| Peach | 2.64 | Fills, tints and icons only |
| Sky | 2.47 | Fills, tints and icons only |
| Pink | 2.34 | Fills, tints and icons only |
| Yellow | 2.31 | Fills, tints and icons only |

Other Latte pairs: Text on Base 7.06. Subtext0 on Base 4.37 and on Mantle 4.06,
so use Subtext1 (`#5c5f77`) for small secondary text. Surface1 on Base is only
1.61 and Overlay2 is 3.49, so any border that identifies a control (inputs,
selects, checkboxes, the dropzone) uses Overlay2. Surface1 is for decorative
dividers.

**Mocha:** every accent passes as text on Base (7.1 to 12.9). Text on Base is
11.3 and Subtext0 on Base is 7.4.

**Rule for Latte:** only Mauve, Red and large Blue may carry text or
Base-coloured text on a button fill. Every other accent is a fill, a tint
(`color-mix` of the accent into the card colour) or an icon, with a
`text`-coloured label on top. Status pills are tinted fill, coloured dot and a
`text` label. Re-check any new pair against the table before shipping.

### Colour roles

**Primary action.** Mauve (`#8839ef` Latte, `#cba6f7` Mocha), with Base as the
foreground. Buttons, selection, links, focus ring.

**Tool categories.** One accent pair per category. The first colour is the chip,
tile and icon fill; the second is the tint or secondary detail.

| Category | Accent pair | Tools |
| --- | --- | --- |
| Image | Mauve + Pink | Converter, resizer, background removal, favicon generator |
| Video & Audio (`video`) | Peach + Yellow | Video converter, video cutter, video compressor, video to GIF, extract audio, audio cutter |
| File | Teal + Green | PDF merge, PDF split, Protect PDF, Unlock PDF, Office to PDF, Remove Metadata, QR code generator, QR code reader |
| Color | Blue + Sapphire | Palette extractor, color picker |
| Developer | Lavender + Flamingo | Cron generator, Markdown preview, diff viewer, JSON converter, JWT decoder |

Color tools read or help you choose colors. A tool that takes an image and
returns a changed image (grayscale, make a color transparent) stays in Image.
Blue is a fill and tint here like every other accent. Latte lets large Blue
carry text, but the category chip keeps a `text` label for consistency.

File tools take files you drop in. Developer tools take text you type or paste
and are mostly used by people who write code. A new tool goes in whichever of
the two matches its input. Flamingo is reserved for this pair, and Sky stays
with status.

Category colour appears on the home tile, the sidebar icon, the page-header
chip, the progress fill and the dropzone drag-over state. It never appears on
buttons; buttons are Mauve.

**Status.** Status keeps its real meaning everywhere.

| Status | Colour |
| --- | --- |
| Success, done | Green |
| Error, destructive | Red |
| Warning | Yellow or Peach |
| Info | Sapphire or Sky |

### Named rules

**The Quiet Surfaces Rule.** Large areas (page, sidebar, cards, panels) use Base, Mantle, Crust and Surface0 only. Accent colour on a large surface is a bug.

**The One Saturated Colour Rule.** A component carries at most one saturated colour. A tile with a Peach chip does not also get a Yellow border and a green badge; the second colour of a pair appears only as a tint or small detail.

**The Status Keeps Its Meaning Rule.** Green means done, Red means error or destruction, Yellow or Peach means warning, Sapphire or Sky means info. Do not use these colours for decoration, and do not reuse a category accent to signal status.

**The Latte Text Rule.** In Latte only Mauve, Red and large Blue carry text or Base-coloured text on a fill. Everything else is fill, tint or icon with a `text` label.

**The Real Border Rule.** A boundary that identifies a control uses Overlay2 (Latte) or Overlay0 (Mocha), 3:1 or better. Surface1 is decoration only.

### Token mapping (shadcn variable to Catppuccin colour)

| Token | Latte | Mocha |
| --- | --- | --- |
| `--background` | base | base |
| `--card`, `--popover` | mantle | surface0 |
| `--sidebar` | crust | mantle |
| `--foreground` | text | text |
| `--muted-foreground` | subtext1 | subtext0 |
| `--border` | surface1 | surface1 |
| `--input` | overlay2 (3:1) | overlay0 |
| `--primary` / foreground | mauve / base | mauve / base |
| `--secondary` | surface0 | surface1 |
| `--accent` | surface1 | surface1 |
| `--destructive` | red | red |
| `--success` | green (fill) | green |
| `--ring` | mauve | mauve |

The theme toggle puts `.dark` and `.mocha` on `<html>` together, so the
existing `@custom-variant dark (&:is(.dark *))` keeps working. Theme state
comes from `next-themes`. Syntax highlighting (`hljs-*`), Mermaid and Sonner
toasts take Catppuccin colours and follow the same class.

## 3. Typography

**Type Family:** Nunito Variable (with `ui-sans-serif, system-ui, sans-serif`). This does not change.
**Mono Font:** IBM Plex Mono (for numeric and dimension readouts)

**Character:** Nunito is rounded, friendly and legible at small sizes, which suits a dense tool UI and the playful direction. The whole product runs on one variable face. Personality comes from weight (200 to 900) and scale, not a second display font. Heroes use heavy weight at a large clamp size; body copy stays at a calm 400; labels and titles step up to 600 and 700.

### Hierarchy
- **Display** (Nunito, 900, `clamp(1.875rem, 5vw, 3rem)`, lh 1.05, tracking `-0.01em`): Hero taglines and signature brand moments. Keep it sparse.
- **Headline** (Nunito, 700, 1.5rem, lh 1.2): Page and section titles.
- **Title** (Nunito, 600, 1.125rem, lh 1.3): Card and panel headers.
- **Body** (Nunito, 400, 0.875rem, lh 1.5): Default UI and prose. Cap prose at 65 to 75ch.
- **Label** (Nunito, 600, 0.875rem, lh 1.4): Buttons, form labels, nav items, badges.

### Named rules
**The One-Family Rule.** Every piece of text is Nunito. If a hero feels flat, raise the weight to 900 and the scale; do not add another typeface.

**The Weight-Earns-Emphasis Rule.** Hierarchy comes from weight and scale, not colour, italics or decoration. Body 400, titles 600, headlines 700, display 900.

**The Fixed-Scale Rule.** Outside the hero, type sizes are fixed rem values, not fluid clamps.

## 4. Elevation and radii

### Shadows
Shadows are neutral and tinted with the text colour at low opacity, never a
brown or coloured cast. In Latte the shadow colour is Text (`#4c4f69`); in Mocha
it is Crust (`#11111b`) at a higher opacity so it still reads on dark surfaces.
Shadows signal that a surface floats or has been raised by interaction; they are
not decoration.

- **xs / sm** (`0 1px 2px` to `0 2px 4px`, Text at 6 to 10%): Resting lift for outline buttons, inputs, small chips.
- **md / lg** (`0 2px 6px` to `0 4px 12px`, Text at 8 to 12%): Cards, home tool tiles, raised panels.
- **xl** (`0 8px 24px`, Text at 12 to 16%): Popovers, dropdowns, sheets, dialogs.
- **Accent edge** (`0 4px 0` in the tile's accent): The hard bottom edge on tool tiles on hover, and on primary buttons. See Components.

### Radii
Radii are friendlier than before. **This is a change:** the old system used
near-square radii (0 to 4px). The new scale is:

| Token | Value | Use |
| --- | --- | --- |
| `rounded.sm` | 6px | Small controls, chips, checkboxes |
| `rounded.md` | 8px | Buttons, inputs, selects |
| `rounded.lg` | 12px | Cards, panels, dialogs |
| `rounded.xl` | 14px | Home tool tiles, large containers |

Controls sit at 6 to 8px, cards and tiles at 8 to 14px. Pills and status chips
are fully round.

## 5. Components

Built on Base UI primitives with a shadcn-derived structure. The feel across all of them: **friendly and tactile**, with soft corners, quiet surfaces and a little colour where it helps.

### Buttons
- **Shape:** `rounded-md` (8px). Default height 2.25rem (`h-9`). Small and icon sizes use 6px.
- **Primary (chunky, pressable):** Mauve fill, Base text. A coloured bottom edge (`0 3px 0` in a darker mix of Mauve and Text) makes it look like a toy key. On `:active` the edge collapses and the button gets `scale(0.97)`. Hover shifts the fill slightly toward Text; contrast must stay at 4.5:1 or better.
- **Outline:** Base background, Overlay2 border, `xs` shadow; hover fills Surface0.
- **Secondary:** Surface0 (Latte) or Surface1 (Mocha) fill, Text label.
- **Ghost:** Transparent; hover fills Surface0.
- **Destructive:** Red tint (`destructive/10`) with Red text. Soft, not a solid red slab.
- **Focus / Active:** Focus-visible shows a 3px Mauve ring (`ring-ring/50`) plus border shift. Active scales to `0.97` (150ms, `--ease-out`). Transitions list their properties (no `transition-all`).

### Cards and containers
- **Radius:** `rounded-lg` (12px).
- **Background:** Mantle in Latte, Surface0 in Mocha.
- **Shadow:** `md` or `lg` neutral shadow. No nested cards, ever.
- **Border:** Surface1, 1px, decorative.
- **Padding:** 1.5rem.

### Inputs and fields
- **Style:** Base background, 1px Overlay2 border (Overlay0 in Mocha), `rounded-md`, height 2.25rem.
- **Focus:** 3px Mauve ring and border shift to the ring colour.
- **Error / Disabled:** `aria-invalid` shows a Red border and ring; disabled drops to 50% opacity with pointer-events off.

### Navigation
- **Style:** Collapsible left sidebar (Base UI sidebar) on Crust (Latte) or Mantle (Mocha), plus a sticky top header with a blurred bar (`bg-background/70 backdrop-blur-md`) holding the breadcrumb and the theme toggle. The active item sits on a Surface0 pill that slides between items (transform only, 200ms). Each item's icon carries its tool category accent. On mobile the sidebar collapses behind a `SidebarTrigger`, and menu items grow from 32px to 40px on mobile and coarse-pointer devices. The top bar shows a `Group / Tool` breadcrumb; the page `h1` carries the full tool name.
- **Logo:** The mascot face crop (see Mascot).
- **Typography:** Nunito Label (600, 0.875rem).

### Home tool tiles (signature component)
- 14px radius tiles linking to each tool. A tile has a Mantle or Surface0 background, an icon chip filled with the category's first accent and a tinted detail from the second, and a `text`-coloured label.
- Hover lifts the tile 2px and shows the accent edge (`0 4px 0` in the category accent); press squishes the edge to 1px. The icon chip does one small tilt. 160 to 200ms, `--ease-out`.
- Tiles use token colours only. Do not hardcode `orange-*` or `emerald-*`, and do not put text over a background image.

### Status pills and chips
Tinted fill (`color-mix` of the status colour into the card colour), a coloured dot, and a `text` label. Never coloured text in Latte except Red.

### Dropzone and progress
- **Dropzone:** Overlay2 dashed border at rest. On drag-over the border goes solid in the category accent, with a faint accent glow, and the upload icon hops once.
- **Progress:** Candy-stripe fill in the category accent, moving at constant speed (linear is correct here).
- **Done:** The check draws itself (stroke-dashoffset, 250ms) and the row gets a Green tint that fades. A small burst of Catppuccin-coloured dots plays once, only on completion of a user job.

## 6. Motion

Principle: animate in proportion to how rarely something is seen. Nothing used
hundreds of times a day moves much.

### Frequency table

| Frequency | Where | Treatment |
| --- | --- | --- |
| Rare, first look | Home hero, empty states, "all done" | Can delight |
| Occasional | Dialogs, toasts, file added, job finished, theme toggle | Standard, under 300ms |
| Constant | Sidebar nav, buttons, inputs, keyboard actions | Minimal: press scale and colour only |

### Playful moments
All are CSS transitions or keyframes. No motion library is installed and none is needed.

1. Mascot idle on the home hero: slow bob (about 6px, 5 to 6s) with a very small tilt, whole image only.
2. Tile hover: lift, accent edge, one icon tilt.
3. Home grid first load: 40ms stagger, opacity plus 8px rise, once per session, never blocks clicks.
4. Chunky primary buttons: edge drops on `:active` plus `scale(0.97)`.
5. Dropzone drag-over: solid accent border, icon hop, faint glow. Dropped file rows arrive with a short pop (scale 0.96 to 1 plus fade), not a long list animation.
6. Progress: candy-stripe fill.
7. Done moment: self-drawing check, green tint, dot burst, friendlier toast voice. Completion of a user job only.
8. Theme toggle: sun and moon swap with a circular clip-path reveal from the button via the View Transitions API where supported, instant elsewhere.
9. Sidebar active pill: slides between items, transform only, 200ms.
10. Route change: 120ms crossfade of page content only. No slides.
11. Sidebar logo: the face crop tilts or winks on hover, on hover-capable devices only.

### Rules
- **Curves:** `--ease-out` `cubic-bezier(0.23, 1, 0.32, 1)` for enter and press feedback; `--ease-drawer` `cubic-bezier(0.32, 0.72, 0, 1)` for the sidebar and sheets. Never `ease-linear` for UI movement; linear is only for constant-speed progress.
- **Duration:** UI animations stay under 300ms; press feedback 100 to 160ms. The only things over 300ms are the home idle loop and the one-time celebration moments.
- **Properties:** Animate only `transform` and `opacity` (colour and shadow transitions are fine for state). Keep `backdrop-filter` blur on small areas such as the sticky header. No layout properties.
- **Loops:** Looping animation runs only on the home page, and pauses when `document.hidden`.
- **Keyboard:** Do not animate keyboard-driven actions.
- **Reduced motion:** Every animation has a `prefers-reduced-motion: reduce` version. It keeps opacity, colour and shadow transitions and drops movement (translate, scale, tilt, bob, hop, burst, clip-path reveal, width and slide or zoom enters). The mascot is static, the theme swap is instant, the done check appears without drawing, and spinners become a slow opacity pulse. Handled globally in `src/styles.css`.

## 7. Mascot

Palico is a single illustration (`Chibi Cat Adventurer with Whimsical Hammer`),
a clean cutout with its own Catppuccin-family colours (blue hat, lavender scarf,
pink-mauve hammer, green plants, yellow coat). It sits on Base, Mantle or Crust
in both themes without a halo.

- **Hero:** Home only, as the cropped art (content box 1131x992, nearly square) in WebP with 1x and 2x variants, optionally AVIF. Never serve the uncropped 2 MB PNG. The idle bob applies here.
- **Sidebar:** A separate face-only crop. Not the full body at small sizes. Tilt or wink on hover.
- **Favicons and app icons:** The same face crop: 16, 32, 64, ico, apple-touch, android 192 and 512. `site.webmanifest` `theme_color` and `background_color` use the Base colour, not pure white.
- **No extra poses.** There is one image. Empty and error states reuse it; loading states use whole-image motion (bob, tilt), not a hammer swing or new art.
- **Do not recolour, outline or crop it differently** per theme. If it needs more contrast, change the surface behind it.
- **Not on tool pages** except empty and error states, where it appears once, small.

## 8. Do's and Don'ts

### Do:
- **Do** surface the offline, on-device guarantee as a first-class part of the interface (the home trust badges). Privacy is visible, not buried.
- **Do** keep one job and few clicks per tool, with sensible defaults and advanced options tucked away.
- **Do** keep large surfaces to Base, Mantle, Crust and Surface0, and put colour in small repeated spots.
- **Do** use Mauve for primary actions and the category pair for category identity.
- **Do** use Text on Base surfaces, Subtext1 (Latte) or Subtext0 (Mocha) for secondary text, and check any other pair against the contrast table.
- **Do** use status colours for their real meaning: Green done, Red error, Yellow or Peach warning, Sapphire or Sky info.
- **Do** use neutral, text-tinted, low-opacity shadows and the chunky pressable primary button.
- **Do** keep typography single-family and use weight to step the hierarchy.
- **Do** give every control a real focus-visible state (3px Mauve ring) and every animation a `prefers-reduced-motion` alternative.
- **Do** reserve delight for rare moments and keep frequent actions fast and calm.

### Don't:
- **Don't** evoke ad-heavy converter sites: no fake or disguised download buttons, no upload-to-server ambiguity, no popups or dark patterns.
- **Don't** drift into cold enterprise SaaS: no navy-and-gray, no soulless density.
- **Don't** put motion in the way of the task: no animation on sidebar nav, buttons beyond the press, inputs or keyboard actions, and no looping animation outside the home page.
- **Don't** animate anything other than `transform` and `opacity`, or run an animation over 300ms in the UI.
- **Don't** use Latte accents other than Mauve, Red and large Blue for text, or for fills that carry Base-coloured text.
- **Don't** put a saturated colour on a large surface, or more than one saturated colour in a component.
- **Don't** use Red for anything but errors and destruction, or Green for anything but success.
- **Don't** hardcode off-palette colours (`orange-300`, `emerald-300`, raw hex); use tokens.
- **Don't** use pure black or pure white for text or surfaces; use Text and Base.
- **Don't** nest cards, or use a coloured `border-left` or `border-right` stripe as a card or alert accent.
- **Don't** introduce a second typeface for brand moments.
- **Don't** add new mascot poses or recolour the mascot; reuse the one image.

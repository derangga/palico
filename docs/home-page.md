# The home page

Home is a launchpad, not a catalogue. From top to bottom:

1. The hero, in one of two variants.
2. **Start here**: four common jobs, for a first-time visitor.
3. **Your tools**: Favourites and Recently used, for anyone with history
   (`docs/recent-tools.md`).
4. **Browse by type**: five collapsed category rows.

```
src/routes/index.tsx                      the route, the pre-paint script, the order above
src/components/home/hero.tsx              the hero, one h1
src/components/home/hero-lanes.tsx        the tool lanes
src/components/home/use-hero-pause.ts     pauses the loops when nobody can see them
src/components/home/start-here.tsx        the four starter tiles
src/components/home/your-tools.tsx        Favourites and Recently used
src/components/home/browse-by-type.tsx    the five <details> rows
src/components/home/use-returning-flag.ts the returning decision
src/components/home/home.css              hero, lanes, row height, chevron, hide rules
src/lib/start-here.ts                     the four paths
```

Home used to be a 28-tile grid with a one-tool landing hero. The grid made Home long
and gave every tool the same weight. The sidebar and the search palette already list
every tool, so Home now leads with what a person is likely to want next and keeps the
full list one click away.

## Two heroes

The page is prerendered, so there is one markup for everyone, and CSS picks the
variant from `html[data-returning]`:

- **Full hero (first visit, the default).** One Crust card with the headline, the
  tagline, the "Convert an image" button, and the mascot with the tool lanes behind
  it. On a phone the mascot sits on top in a box up to 230px wide and the copy
  follows; from `lg` the copy is on the left and the mascot, up to 330px, on the
  right. The lanes fill a band 112% by 120% of the mascot box, not the whole card,
  so all three lanes stay close around the mascot instead of spreading to the card
  edges. The mascot has the slow idle bob (about 6px over 5.5s).
- **Compact hero (a favourite or recent tool exists).** A Crust band about 150px tall
  on a phone and 170px from 560px of band width. The headline and tagline sit in the
  left 54 to 64 percent and the lanes in the right 42 to 46 percent. There is no mascot
  and no button: the sidebar logo already shows the face, and Home is no longer a
  one-tool landing page. On a phone the tagline clips to two lines to hold the height.

There is exactly one `h1`. The mascot image is in the prerendered HTML for both
variants and `display: none` for returning visitors, because the markup has to be the
same before anyone's history is known. The browser still downloads a hidden image
(about 100 KB at 1x, 290 KB at 2x), so a returning visitor pays for a mascot they do
not see. Only the first visit needs it up front; mounting it from JavaScript instead
would put a hole in the prerendered LCP and is the thing to revisit if this shows up
in a measurement.

Sizes follow the hero's width, not the screen's: the hero is a CSS container
(`container: hero / inline-size`) and the chip size, band sizes and headline size
change at 560px of container width.

### Tool lanes

Three lanes of five icons in a band tilted 10 degrees, like a slash. Lane 1 slides up,
lane 2 down, lane 3 up, at 20, 24 and 22 seconds per pass with negative delays so the
page opens mid-loop. Each lane renders its five icons twice, so a `translateY(-50%)`
loop ends exactly where it began (every chip has its own bottom margin, so half the
lane is exactly one set). The speed is constant, so the easing is `linear`, the one
place the DESIGN.md rule for constant motion applies. A fixed mask fades the band out
at the top and bottom.

The icons are lucide glyphs in their category colour: peach for video, mauve for
image, teal for file, blue for color, lavender for developer. A chip is the category
colour at 24 percent over Crust with a 1px border at 32 percent and the icon in the
solid colour, set from `data-cat` alone so no default colour can override it. Five
colours in one component is the single exception to "one saturated colour per
component" in DESIGN.md: they are tints, they are decoration, and the whole block is
`aria-hidden`.

Motion rules:

- Only `transform` animates (the lanes and the mascot bob). No blur or backdrop
  filter anywhere in the hero, no `will-change`, no layout property. The loops are CSS
  keyframes, so they stay smooth while the page hydrates.
- The loops run on Home only. They pause (`animation-play-state: paused`) when the
  tab is hidden and when the hero has scrolled off screen. `use-hero-pause.ts` toggles
  `data-paused` on the hero from `visibilitychange` and an `IntersectionObserver`,
  straight on the DOM node, so nothing re-renders.
- Under `prefers-reduced-motion: reduce` the lanes stay at their resting positions
  (a small offset per lane so they do not line up) and the mascot is still.
- There is no hover effect, so nothing is gated to hover devices.

## Returning or first-time: no flash, no mid-visit swap

The hero variant and the Start here group depend on history, which only the browser
knows. The rule has three parts:

1. **Before first paint.** The inline script in `<head>` (`yourToolsScript`, see
   `docs/recent-tools.md`) sets `data-returning="1"` on `<html>` when the row will show
   at least one tool. CSS reads `html[data-returning]` to pick the compact hero and hide
   Start here. With no attribute (the prerendered default) the full hero and Start here
   show.
2. **Client navigation.** The script does not run again when Home is reached from
   another page. `useReturningFlag` sets or removes the attribute once the history has
   first been read (`phase` leaves `idle`), in a layout effect so it lands before paint.
3. **Frozen for the visit.** After that first decision the attribute does not change
   while the person stays on Home. Starring a starter tile shows the Your tools row but
   keeps the full hero and Start here until the next visit, so the page does not change
   character under the cursor. The attribute is removed when Home unmounts, so other
   pages and the next Home visit start clean.

Blocked storage (`unavailable`) counts as a first-time visitor: the full hero and Start
here, and no row. "Returning" is decided by the pure `isReturningVisitor` in
`src/lib/tool-history/model.ts`: at least one favourite or recent tool the registry
still knows. A removed route in storage does not count.

Start here comes before the row in the page. When a first-timer stars a starter tile,
the row opens below it (growing, see `docs/recent-tools.md`), so the tile under the
finger does not move.

## Start here

Four compact tiles, with stars like any tile: Image Converter (`/converter`), Compress
Image (`/compressor`), Compress Video (`/video-compressor`) and Merge PDFs
(`/pdf-merge`). They are registry entries (`startHereTools()` in `src/lib/start-here.ts`),
not copies, and `start-here.test.ts` fails when a path stops being a tool. The group is
prerendered and hidden by `html[data-returning] .start-here`.

## Browse by type

One native `<details>` per category, in registry order (`toolGroups`), closed by
default and with no stored state. The summary is a 52px row: category dot, name, the
tool count and a chevron that turns when the row is open (`transform`, 200ms,
`--ease-out`; reduced motion drops the transition and keeps the turned chevron, which
still says whether the row is open). The panel just opens: no height animation. Inside
is the full `ToolTile` (blurb, star, offline dot) in a grid of one column below `sm` and
two from `sm`, an odd last tile spanning the row. From `lg` the five rows sit in two
columns, and an open row takes only its own column.

Why `<details>`:

- The keyboard, find-in-page and screen readers work with no script, and Tab reaches
  every summary.
- **The tool links stay in the prerendered HTML**, inside the closed rows, so crawlers
  and visitors without JavaScript still reach every tool. Do not render the panels
  from JavaScript.
- The summary carries the `tools-<id>` id. When the Your tools row disappears under the
  cursor, `your-tools.tsx` puts focus on the first summary. A summary is focusable
  already, so it has no `tabIndex`; a `tabindex="-1"` on it would take it out of the Tab
  order and stop keyboard users opening the row.

The rows are transparent with a border, not cards, so the tiles inside them are not a
card in a card. The summary hover colour only applies on hover-capable devices, so it
does not stick after a tap.

The category names are no longer headings, so heading navigation in a screen reader does
not list the five categories. A heading inside a `<summary>` has poor support, so this
is accepted. The rows are still reachable with Tab and announced as expandable.

The compact tile (Your tools and Start here) sets the name at 0.8125rem below `sm` and
lets a long word break (`overflow-wrap: anywhere`). Two columns at 390px leave about
60px for the name, and a word like "Background" would otherwise be cut off.

## Not done

- A search field on Home. The header search and Cmd/Ctrl+K already do it.
- Remembering which category rows are open.
- Changing the hero while the person is on Home, for example when they star their first
  tool. It waits for the next visit by design.
- A view transition when a tile moves from Recently used to Favourites. The star click
  runs through the async history store, and wrapping it would need `flushSync` plumbing
  in the shared `ToolStar`.

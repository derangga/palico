# Tool search

Cmd/Ctrl+K opens a palette that jumps to any tool. A search button in the root
header opens the same palette, so it also works on mobile and for people who do
not use the keyboard. It searches the entries of `TOOLS` and nothing else. The
data is static, so it works offline and sends nothing anywhere. There is no
search dependency.

## Flow

1. `RootLayout` (`src/routes/__root.tsx`) holds the open state and renders
   `SearchButton` next to the theme toggle and one `SearchPalette` next to the
   sidebar.
2. `SearchPalette` (`src/components/search/search-palette.tsx`) owns the
   Cmd/Ctrl+K listener. It always calls `preventDefault` and toggles, including
   when focus is inside a textarea (Markdown Preview, Diff Viewer). Cmd/Ctrl+B
   for the sidebar behaves the same way. It ignores key repeat, so holding the
   keys does not flicker the palette. It also does not open on top of another
   modal (the mobile sidebar sheet, the download consent dialog), though it
   still closes its own palette.
3. The palette is a Base UI `Dialog` with an `Autocomplete` in `inline` mode, so
   the list sits inside the dialog and not in a popup.
4. With an empty query the list is the four category groups, with the same dots
   as the home grid. Typing switches to one flat ranked list. The first row is
   highlighted as soon as the person types, so Enter works straight away.
5. Enter on the highlighted row, or a click, closes the palette and navigates.
   `Autocomplete.Item` fires `onClick` for both. Escape closes and returns focus
   to where it was. The query is cleared once the palette has closed, so the list
   does not jump while closing.
6. A tool with an `engine` shows a compact `OfflineDot` in its row, with the same
   guard as the home tile (hidden when the status is `Unavailable`). Compact means
   the dot only, like the sidebar. The full text ("Needs a ~31 MB download") is
   the tooltip and stays in the row for screen readers. The long text used to sit
   beside the dot, and it pushed the blurbs into truncation. The offline runtime
   only starts in production builds, so the dots show there and not in `vite dev`.

## Matching

`searchTools` (`src/lib/tool-search.ts`) is a pure function. It lowercases the
query and splits it on anything that is not a letter or digit, so `pdf-merge`
finds Merge PDFs. Every word has to match somewhere, or the tool
drops out. A tool's score is the sum, over the words, of the best match that word
gets:

| Match | Points |
| --- | --- |
| Label starts with the word | 5 |
| A word in the label starts with it | 4 |
| Label contains it | 3 |
| A word of a keyword starts with it | 2 |
| A word of the blurb starts with it | 1 |

Only the label can match in the middle of a word ("zip" finds "Unzipper").
Keywords and the blurb match at the start of a word, so `ai` finds Remove
Background through its `ai` keyword and does not find Compress Video through
"email" or Markdown Preview through "mermaid".

Results sort by score, highest first. Ties keep registry order, so the order is
stable. An empty query returns every tool in registry order.

It is not an Effect function and has no error type, because it is synchronous and
has no failure path.

## Keywords

Every `Tool` has a required `keywords` array. People search for the job or the
format ("gif", "mp3", "exif"), and the label and blurb miss most of those. The
field is required on purpose, so adding a 23rd tool fails the typecheck until
someone thinks about how it will be searched for.

Write only what the tool really does. Take terms from its `docs/` file and its
accepted formats, not from guesses. For example the image converter has no
`heic` keyword, because it cannot decode HEIC. Add synonyms and spelling
variants people use ("colors" and "colours"). Do not repeat words already in the
label, since the label already scores higher.

A keyword scores 2 and a blurb scores 1, so a tool that only mentions a format
in its blurb loses to tools that list it as a keyword. List the formats a tool is
mainly for. The image converter lists `jpg`, `png` and `webp` for this reason,
and without them a search for `png` put it last. When tools tie, registry order
decides.

## Why the list gets real `items` and `filter={null}`

`searchTools` has already filtered and ranked, so the palette passes
`filter={null}` to stop the library filtering again. Base UI's own `filter` can
only say yes or no per item, so it cannot set the order.

The list still goes in as `items`, not as hand-written children. With plain
children the first ArrowDown did nothing visible. `autoHighlight` had already
highlighted the first row, and the key press left the highlight there. Only the
second press moved it. I did not trace why inside the library. Trying
`autoHighlight="always"` and a `value` on each row changed nothing. With real
`items` the first ArrowDown moves to the second row. Both views use the same section shape (`value`, optional
`category`, `items`), a labelled group per category when empty and one group
labelled "Results" for screen readers only when searching.

## UI notes

- The palette does not animate. DESIGN.md says not to animate keyboard-driven
  actions, and Cmd/Ctrl+K is one. The overlay copies the sheet's colours and blur
  but has no transition, so it opens and closes at once.
- The search box is a rounded field with the same classes as `ui/input.tsx`, so
  it gets the standard 3px Mauve focus ring. It sits inside 8px of padding in the
  popup, which gives the ring room, because the popup clips overflow. An earlier
  version put an inset ring on a full-width band, and it looked heavy against the
  rounded corners.
- The shortcut matches the K key by its letter. When the layout has no Latin K
  (Russian, Greek) it falls back to the physical position (`event.code`). A Latin
  layout such as Dvorak keeps its own letter, so Ctrl+K stays where it prints.
- The popup sits at 12dvh from the top with a height cap in dvh, so the on-screen
  keyboard does not cover the list on a phone.
- The header button is icon-only on narrow screens and reads "Search tools" with a
  key hint from `sm` up. The hint says "Ctrl K" on the server and on first render,
  then switches to the Command symbol on Apple devices after hydration
  (`useSyncExternalStore` with a server snapshot), so prerendered HTML matches.
  The hint is hidden on coarse pointers.
- The status line under the list is an `output` element that stays mounted, so
  screen readers announce it when its text changes. It shows "No tool matches ..."
  when there is nothing and is screen reader only otherwise, where it reads a
  count. With no matches the list has no group at all, not an empty one.

## Not covered

- Typo tolerant matching. Revisit past about 50 tools or if people report misses.
- Recently used tools and any stored state.
- Actions (toggle theme, manage offline data) and Home as a result.
- A search field on the home page or in the sidebar.
- Searching inside tool pages or across `docs/`.
- Highlighting the matched text in a row.

## Tests

`src/lib/tool-search.test.ts` covers the empty query, the full ranking order, tie
order, AND across words, a keyword-only hit, case and spacing, punctuation, no
match, the image converter first for `jpg`, `png` and `webp`, and a registry
guard: searching a tool's own full label returns that tool first. The guard does
not cover partial labels or format terms, so a keyword change that reorders those
needs its own test like the converter one. The palette itself has no component
test. It was driven in a real browser (open from the button and from Cmd/Ctrl+K,
from inside a textarea, Escape and focus return, arrows and Enter, click, empty
result, a 390px viewport, dark mode, reduced motion).

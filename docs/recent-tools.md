# Your tools: favourites and recently used

The home page has a "Your tools" row above the category groups. It holds the tools
a person starred, then up to six they used recently. A first-time visitor sees
no row at all. Everything is stored in the browser and never sent anywhere, like
the rest of the product.

## Flow

1. **Star.** Every home tile and every tool page header has a star button
   (`ToolStar`, `src/components/tool-star.tsx`). It is a real `button` with
   `aria-pressed` and a label ("Favourite {tool}"), in English and Indonesian.
   On the tile it sits above the tile's link, not inside it, so a click on the
   star never navigates.
2. **Use.** When a job finishes and the result is ready to download or copy, the
   tool calls `recordToolUse("/path")` (`src/lib/tool-history/store.ts`). The
   path goes to the front of the recent list. Visiting a page does not count.
3. **Show.** The home page renders `YourTools` after hydration. Favourites come
   first in the order they were starred, then the recent tools that are not
   starred. Each is a compact tile with its own star, so a tool is unstarred from
   where it is shown.
4. **Clear recent.** A button on the row header empties the recent list and keeps
   the favourites. It only shows while there is a recent tool to clear.
5. **Search.** With an empty query the Cmd/Ctrl+K palette lists the same tools in
   a "Your tools" group at the top (see `docs/search.md`).
6. **Other tabs.** A change in one tab reaches the others through the `storage`
   event, so a star in one tab shows in the other without a reload.

A note under the row says "Saved in this browser only."

## What is stored

One `localStorage` key, `palico-tools`:

```json
{ "version": 1, "favourites": ["/resizer"], "recent": [{ "to": "/converter", "at": 1767225600000 }] }
```

Paths only. Never a file name, a size, an option or anything the person typed.
`at` is the time of use in milliseconds. `recent` is most recent first, has no
duplicates and holds at most twelve entries (`MAX_RECENT`). The row shows six
(`SHOWN_RECENT`). Storing twice as many keeps the row full when recent tools are
starred: a starred tool moves into the favourites part, so the cap has to count
the recent tools that are left, not the ones stored. `yourToolsParts` takes the
first six recent entries that are known and not starred.

The value is untrusted: it is decoded with Effect Schema (`ToolHistoryJson`). A
missing value, bad JSON, a wrong shape or a version other than 1 reads as an empty
history, and the next write replaces it. After decoding, duplicates are dropped
and `recent` is cut to twelve, so storage edited by hand cannot grow it. A
path that is no longer a tool (a renamed or removed route) is skipped when the
row is built. A removed recent tool ages out of the twelve; a removed favourite stays
in storage, hidden, because nothing can unstar it.

## How it is built

```
src/lib/tool-history/
  shapes.ts     the Schema, STORAGE_KEY, MAX_RECENT, SHOWN_RECENT, emptyHistory
  errors.ts     ToolHistoryStorageError (Schema.TaggedError)
  hosts.ts      ToolHistoryHost: localStorage read and write, as an Effect service
  model.ts      pure changes: parseHistory, toggleFavourite, recordUse, clearRecent, yourTools
  service.ts    ToolHistory: load, toggleFavourite, recordUse, clearRecent
  store.ts      the React-facing store and recordToolUse
  prepaint.ts   the inline script that reserves the row's height
  fakes.ts      ToolHistoryHost fake for tests
src/hooks/use-tool-history.ts           the hook components read
src/hooks/use-record-tool-use-once.ts   for tools that show a result live
src/components/tool-star.tsx            the star
src/components/home/your-tools.tsx      the row
```

This follows `src/lib/i18n/hosts.ts`: the host is a small service over the
browser, the logic runs against it, and tests provide a fake, so the same graph
runs in node.

`ToolHistory` is a `Context.Service`. Each method reads storage fresh, applies one
pure function from `model.ts` and writes back, so two tabs never overwrite each
other with a stale copy held in memory. Storage that throws fails with
`ToolHistoryStorageError` (`operation` is `read` or `write`), on the error
channel.

`store.ts` is the edge. It runs the effects with a `ManagedRuntime` and turns
every outcome into a state the UI can read: `idle`, `ready` with the data, or
`unavailable`. A caller never sees an error. `unavailable` hides the row and
disables the stars (the label then says why). `recordToolUse` is fire and forget,
so a storage that refuses the write cannot touch the tool the person is using.

## Why it works this way

- **Success, not a visit.** A page open is not use. A job that finished is. So
  every tool calls `recordToolUse` at the point where a result exists. The list
  then means "tools that did something for me".
- **Paths only.** The history is a list of routes. Keeping file names and settings
  out is the privacy promise made concrete, and it keeps the value tiny.
- **Read after hydration.** The home page is prerendered, so the server cannot
  know the history. The state starts `idle` on the server and on the first client
  render, which keeps hydration matching, and the first `useToolHistory` effect
  loads it. `useSyncExternalStore` gets a server snapshot of `idle` for the same
  reason.
- **No jump.** Filling the row after hydration would push every group down. A tiny
  inline script in the home `<head>` (`prepaint.ts`, the same idea as
  `SEEN_SCRIPT` in `src/routes/index.tsx`) reads the storage key before first
  paint, counts the tools the row will show with the same rules as `yourTools`,
  and sets `data-your-tools` on `<html>` plus `--yt-rows-2` and `--yt-rows-3`.
  `home.css` turns that into a `min-height` on the slot that is always in the
  page. The row's height is fixed by design: the header is 2rem, tiles are 3.5rem
  with 0.75rem gaps, the note is one line, and the grid is two columns below 640px
  and three above. Once the history is read the attribute is removed and the row
  sizes itself. If the script finds nothing, nothing is reserved. If storage is
  unreadable the slot collapses, which is a shift on load.
- **The one shift that stays.** A visitor with no history who stars their first
  tool, or who unstars the last one, changes the page while looking at it. The row
  cannot be reserved for a change nobody has made yet, and hiding it until the next
  visit would make the star look broken. So the shift is accepted and softened.
  Appearing: the slot grows open over 220ms (`grid-template-rows` 0fr to 1fr, class
  `is-growing`), with the bottom gap inside the clipped section until the animation
  ends. This is the only layout property animated in the product, allowed because
  it follows a deliberate click and cannot be avoided otherwise. It is only used
  when the history was already read and empty, never after hydration, where the
  height is reserved. Reduced motion opens the row at once. Disappearing: not
  animated. The content is unmounted and the groups move up in one frame, because
  keeping it mounted to animate out would need a second copy of the row state.
- **Focus and speech.** A click that removes the focused element leaves focus on
  the page body, so the row hands focus on. After "Clear recent", focus goes to the
  row heading (`tabIndex={-1}`). After unstarring a tile in the row, it goes to the
  star now at that position, else the row heading. If the row is gone, it goes to
  the first category heading (also `tabIndex={-1}`). A live region (`output`, always
  mounted) says "Recent tools cleared" or "Removed {tool} from favourites" and
  empties after four seconds. Stars outside the row rely on `aria-pressed` alone.
- **Blocked storage.** The stars are `aria-disabled` with a no-op click, not
  `disabled`, so Tab still reaches them and the label ("Can't favourite {tool}:
  this browser blocks storage") explains why nothing happens.
- **Errors never reach the UI.** `store.ts` settles every call with `matchCause`,
  so a defect becomes the `unavailable` state like a storage error, and the
  promise never rejects. The state is a `SubscriptionRef` read through `toStore`
  from `src/lib/offline/state.ts`.
- **Compact tiles in the row.** The row reuses `ToolTile` with `compact`: one line,
  no blurb, no offline dot. A row of full tiles would be four or five rows tall
  with eight tools.
- **The tile is a div.** A button cannot sit inside an anchor. The card is a `div`
  with the card styles, the link stretches over it with `::after`, and the star
  sits above with `z-10`. The press squish in `home.css` follows `a:active`, so
  pressing the star does not squish the tile, and the focus ring follows
  `a:focus-visible`.
- **Motion.** The row fades in with a 6px rise over 220ms the first time it fills in
  a visit: after hydration, or when the first star is added. Opening Home with the
  history already loaded does not replay it. The star scales to 0.9 while pressed
  and pops once (0.85, 1.12, 1 over 240ms) when a mouse or touch click turns it on.
  A keyboard click does not pop, and neither does the star that appears starred
  after hydration or from another tab. Reduced motion keeps the row fade and drops
  the rest.
- **Colour.** A starred star is filled in the tool's category ink, not yellow.
  Yellow means warning in this design system. See `DESIGN.md`.

## Where each tool records use

A tool records when a result is ready. For pure live tools there is no job, so the
moment is the person taking the result.

| Tool | Recorded when |
| --- | --- |
| Image Converter, Compress Image | At least one file in the batch converted |
| Resize Image | The resize succeeded |
| Remove Background, Favicon Generator | The result is ready |
| Video Converter | At least one file in the batch converted |
| Video Cutter, Audio Cutter, Video to GIF, Extract Audio | The output is ready |
| Compress Video | A compressed file was produced (not when the original was kept) |
| Merge PDFs, Split PDF, Organize PDF, PDF to Images | The file is built, just before the download starts |
| Office to PDF | At least one document converted |
| Remove Metadata | At least one file was cleaned |
| Palette Extractor, QR Code Reader | A palette or code was read |
| QR Code Generator | A PNG or SVG was downloaded or copied |
| Diff Viewer | A diff was computed |
| Markdown Preview | The Markdown was copied or downloaded |
| Cron Generator | The expression was copied |
| JSON Converter | The output was copied or downloaded |
| Color Picker | A color value or the CSS variables were copied |
| JWT Decoder | A token was decoded, once per visit (`useRecordToolUseOnce`) |

`src/lib/tool-history/wiring.test.ts` reads the source and fails when a tool in
`TOOLS` has no `recordToolUse` call, or a call names a path that is not a tool.
A new tool must record use, and its path must be in the registry.

## Tests

- `tool-history.test.ts`: the service against a fake host (empty and corrupt
  values, recording with the clock, building on stored data, clearing, stored
  shape, read and write failures) and the pure model (dedupe, cap at twelve, order,
  the `yourTools` list, six shown after starred tools are left out).
- `prepaint.test.ts`: the inline script run against stand-ins for `localStorage`
  and `<html>`, including blocked storage and junk values.
- `wiring.test.ts`: every tool records use.
- `src/lib/tool-search.test.ts`: the empty-query ranking with history.

The row, the star and the palette have no component test. Drive them in a real
browser: star from a tile and from a header, click the star on a tile (no
navigation), reload (no jump), the first star on a fresh profile (the slot grows),
clear recent and unstar from the row (focus moves, the live region speaks), a
second tab, blocked storage (Tab reaches the star), 390px, dark mode, reduced
motion.

## Not done

- Sync across devices. There is no account and no server, by design.
- Reordering favourites. They keep the order they were starred in.
- A cap on favourites. The row grows with them.
- Recording the "kept" outcome of Compress Video, where no new file exists.
- Export or import of the list.
- A confirmation or undo for Clear recent. It only touches the list of paths.
- An exit animation when the row empties. The groups move up at once.
- Hiding the row from the palette when the person turns it off. There is no setting.
- Recording from a second tab at the same moment: the last write wins on the
  recent list. The read-modify-write is not a transaction.

# Organize PDF

The tool at `/pdf-organize` shows every page of one PDF in a grid. The user
rotates, deletes and reorders pages, then saves a new PDF.

## Flow

1. The user drops one PDF (50 MB, 100 pages). `loadPdf` renders every page to
   a 200 px thumbnail, the same as Split. Editing is disabled until the last
   thumbnail arrives, so a late thumbnail never lands in a list the user is
   rearranging.
2. State lives in `organizeReducer` (`src/components/pdf-organize/state.ts`).
   Each page is `{ key, sourceIndex, rotation }`. Deleting removes it from the
   list. "Restore all" rebuilds the list from the loaded thumbnails, so there
   is no undo stack.
3. "Save PDF" calls `extractPages` with `pageIndices` (the kept pages in their
   new order) and `rotations`. The output is `<name>_organized.pdf`.

## Why it reuses the extract request

Organize is extract plus rotation. `ExtractRequest` already copies the given
page indices in the given order, which covers delete and reorder. It gained an
optional `rotations` array, and Split's call is unchanged.

## Rotation is a delta

pdf.js renders thumbnails with each page's stored `/Rotate` already applied,
so what the user sees is the baseline. The UI's rotation is added to the
stored value (`applyRotations` in `src/lib/file/pdf-organize.ts`):
a page stored at 90 and turned 270 more saves at 0. In the grid the canvas is
turned with CSS `rotate`, so the bitmap is never re-rendered. The square box
around it means any rotation still fits.

## Keyboard and screen readers

Merge's drag reorder has no keyboard path. Organize does not copy that gap.

The grid (`page-grid.tsx`) is one tab stop with a roving tabindex:

| Key on a focused card | Action |
| --- | --- |
| Arrow keys, Home, End | Move focus |
| Alt + arrow keys | Move the page; focus stays on it |
| R / Shift + R | Rotate right / left |
| Delete or Backspace | Delete; focus goes to the next card, or the previous one if it was last |
| Tab | Into that card's own buttons |

- Up and Down step by the live column count, read from the grid's
  `gridTemplateColumns`, so they follow the responsive layout.
- Shortcuts are ignored when Ctrl or Cmd is held, so Cmd+R still reloads.
- Every action also has a visible button on the card (move earlier, move
  later, rotate left, rotate right, delete), so touch and screen reader users
  do not need the shortcuts. HTML5 drag does not work reliably on touch.
- One `aria-live="polite"` paragraph announces each change, such as "Page 3
  deleted, 2 pages left".
- Rotation is not animated (DESIGN.md: no animation on keyboard actions).

## Not done

- Inserting blank pages, duplicating pages, combining PDFs (Merge then
  Organize covers that).
- Keyboard reordering for Merge. Port the move buttons to `FileCard`.

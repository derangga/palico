# Bottom sheets

Below 768px (`useIsMobile()`), a control that would open a small popup, or a
panel that would sit beside the editor, opens a bottom sheet instead. A sheet
is easier to hit with a thumb and does not push the page down. Larger screens
keep the popup or the second panel.

`src/components/ui/drawer.tsx` wraps the Base UI `Drawer`. Use it for new sheets.
`ui/sheet.tsx` (a Base UI `Dialog`) cannot be swiped, and the cron templates
list still uses it.

## What the wrapper gives you

- Swipe down to close, from the grab handle or from the content (touch only, see
  below). Escape closes it too.
- A grab handle, rounded top corners, a backdrop and the safe-area inset.
- `backdrop={false}` with `modal={false}` on the root for a sheet that leaves the
  page usable. The viewport then lets pointer events through and only the popup
  catches them.

A mouse cannot start a swipe inside `Drawer.Content`, because Base UI keeps that
area for text selection. A finger can. Testing a swipe with a mouse means
dragging the handle. A fast drag reads as a flick and dismisses the sheet. A
slow one snaps to the nearest snap point.

A list that scrolls inside a sheet gets `data-base-ui-swipe-ignore` when a drag
on it must not move the sheet (the cron time lists). A plain long list (the
language list) scrolls normally and only drags the sheet when it is scrolled to
the top.

## Where it is used

| Place | Sheet | Notes |
| --- | --- | --- |
| App language (header) | `language-switcher.tsx` | English and Bahasa Indonesia rows. The desktop dropdown is unchanged. |
| Diff viewer language | `language-select.tsx` | A tappable list, at most half the screen tall. Choosing closes it. The desktop select is unchanged. |

Both language sheets use `option-list.tsx` for the rows.
| Cron time | `cron/schedule-builder.tsx` | Hour and minute lists, applied on tap, Done closes. |
| Markdown preview | `markdown-preview-drawer.tsx` | See below. |

The diff viewer also switches from `split` to `unified` below 768px. Two columns
are about 170px wide on a phone. Its toolbar wraps and hides the decorative stat
bar so the Back button is not pushed off screen.

## Markdown preview

The editor and the preview are not side by side on a phone. A sticky Preview
button sits under the editor and opens a sheet with the rendered document, plus
Copy, Download and Close.

The sheet is the part that is easy to get wrong:

- It is non-modal (`modal={false}`, no backdrop) and has
  `disablePointerDismissal`. Tapping the editor does not close it, and the
  preview keeps updating as the text changes.
- It has two snap points, `0.5` and `1` of the viewport height. Every open
  starts at `0.5`, so the top half of the screen is still the editor. Drag the
  handle up and it covers the whole screen, including the top bar, to read the
  document. It keeps the top safe-area inset so the buttons clear a notch.
- While it is open the page gets `pb-[50svh]`, so the end of the editor can still
  be scrolled above the sheet.
- The editor is `h-[55svh]` on a phone and `h-[1000px]` otherwise. The fullscreen
  toggle only exists above 768px.
- The preview only mounts while the sheet is open, so Mermaid and the Markdown
  parser do no work for a closed sheet.

Copy and Download are `MarkdownActions` in `markdown-preview-panel.tsx`. The
desktop toolbar and the sheet header share them.

Known gap: the software keyboard. The sheet is positioned against the layout
viewport, and the keyboard can cover its lower part on some phones. It was
checked in a desktop browser at a phone size, not on a device with a keyboard.
`Drawer.VirtualKeyboardProvider` is the Base UI part for this if it turns out to
matter.

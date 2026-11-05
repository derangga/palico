# Color picker

`/color-picker` holds one current color and shows it as HEX, RGB, HSL and OKLCH.
Three things set that color: a click on an image, the browser's EyeDropper
(a button, shown only where it exists), and typing a value into the box. Click a
row to copy that format. The colors a person settles on collect in a tray, which
copies them all as CSS variables. It runs on the device and works offline. There
is no color dependency.

It is the second tool in the Color category, next to the
[palette extractor](palette-extractor.md). The extractor answers "what colors are
in this image". The picker answers "what is this exact color".

## Flow

1. The page starts on Latte Mauve (`#8839ef`), so all four formats show before
   anything is chosen.
2. **Typing.** `parseColor` (`src/lib/color/parse.ts`) reads the box on every
   keystroke. A valid value becomes the current color at once. The box keeps what
   was typed (a `draft`), so typing `rgb(255 0 0)` is never rewritten to
   `#ff0000` underneath the cursor. A 3 or 4 digit hex value (`isShortHex`) is
   also the start of a longer one, so it is not applied while typing; it is applied
   when the box is settled. Enter or leaving the box settles it: a valid value
   becomes the current color and goes to the tray, an invalid one reverts to the
   current color as HEX. An empty box is unfinished, not an error.
3. **Image.** `ImagePicker` shows a dropzone (drop, choose, or paste anywhere on
   the page). An image becomes a `PickSurface`, keyed by file, so each image
   loads once and cleans up after itself. `paintImage`
   (`src/lib/color/paint-image.ts`) checks the size (25 MB, like the other image
   tools), decodes with `createImageBitmap` and draws the image at full size on a
   canvas. The bitmap is closed when the effect ends, whether it finished, failed
   or was aborted.
4. **Picking.** The pointer and the keyboard share one path.
   - Pointer down (main button only) picks and starts a drag. Moving while
     pressed keeps picking. Releasing settles the color into the tray, but only
     for a press that began on the canvas. Moving with no button down only
     updates the readout and ends any drag the page lost track of.
   - Tab to the canvas and the cursor starts at the last pixel it looked at, or
     in the middle if it has not looked at one yet. Focus only looks. Arrow keys
     move one pixel (Shift moves 10) and pick as they go. Alt, Ctrl and Cmd with
     an arrow are left to the browser. Enter or Space settles.
   - Every move reads an 11 by 11 window with `getImageData`. The window is drawn
     into a small canvas that CSS scales up with `image-rendering: pixelated`, so
     one cell is one pixel of the image. The middle cell is the cursor pixel.
     A window that hangs over an edge comes back transparent there.
5. **Screen.** `pickFromScreen` (`src/lib/color/eye-dropper.ts`) wraps the
   EyeDropper. Pressing Esc is a cancel, not an error. Any other failure is a
   tagged `ScreenPickError` shown as a toast.

## Why the picker reads pixels on the main thread

The rest of the image tools decode in a worker. The picker reads a few pixels on
every pointer move, and a worker round trip per move would lag behind the cursor.
`createImageBitmap` still decodes off the main thread, and the reads are 11 by 11.

## Exact colors

A picked color has to be a color that is in the file.

- Images over 4,096 px on the long side are shrunk by nearest neighbor
  (`resizeQuality: "pixelated"`). A smooth resize would average neighbors, and
  the picked color would no longer exist in the image. The limit keeps the
  canvas small: a 12,000 px photo is about 430 MB of pixels, which would crash a
  phone tab. The browser still decodes the file at full size once, before the
  shrink, so a very large image has a short memory peak. The card says "shrunk
  to fit" when this happened. A browser that ignores the resize options returns
  the full image, which is refused as an error and not drawn.
- A pixel between half and full opacity is read back by the canvas without its
  alpha, so its RGB can differ from the file by a step or two.
- The canvas context is created with `colorSpace: "srgb"`, so a Display P3 photo
  is read as sRGB, the space the four formats describe.
- A pixel under half opacity is transparent. Picking one keeps the old color and
  the readout says "Transparent here". The cut-off is the same as the extractor's.

## Parsing

`parseColor` accepts:

- HEX with or without `#`: 3, 4, 6 or 8 digits.
- `rgb()` and `rgba()` with commas or spaces, bare numbers or percentages.
- `hsl()` and `hsla()`. The hue may carry `deg`, `grad`, `rad` or `turn`.
  Saturation and lightness may omit the `%`.
- `oklch(L C h)`. Lightness is 0 to 1 or a percentage. Chroma is a number or a
  percentage where 100% is 0.4, as in CSS.

Values are separated by one comma or by spaces; an empty field between commas is
refused. Alpha is read and dropped: after a `/`, or as a fourth value in the
comma form (`rgba(1, 2, 3, 0.5)`). It must be a number or a percentage. A number
too large to be a number (400 digits) is refused, so no channel is ever NaN.
Channels clamp the way CSS does. An
OKLCH color outside sRGB is clamped channel by channel, so its hue can shift a
little. Anything else (named colors, `lab()`, a bad number) is refused. The
refusal message lists one example for each format.

## UI notes

- The tray is always on the page, with an empty message, so the first pick does
  not push the page down. It sits last, so a change in its height moves nothing
  above it.
- The tray keeps eight colors. Picking one that is already there moves it to the
  front. The color that is current has a ring as well as a fill, so it never rests
  on color alone.
- The markers on the image and in the readout are a light ring inside a dark ring
  (`background` and `foreground` tokens), so they show on any color in both
  themes.
- The readout is a fixed block beside the image, not a loupe that follows the
  pointer. A finger would cover a floating one, and a fixed one needs no motion.
  On a narrow screen it sits below the image.
- Copying shows "Copied" for 1.8 seconds in a fixed-width slot, so the value does
  not move, and announces it to screen readers. A failed copy shows an error
  toast.
- A hidden live region announces the pixel under the cursor after a keyboard move
  or focus (its position and HEX value) and "Kept #..." on Enter. Hovering with a
  mouse does not announce, or every pixel the pointer crosses would be read out.
- The invalid-color hint is a polite live region, so a screen reader hears it
  when the box turns invalid.
- The canvas gives up its pixels (`width = 0`) when the image is replaced or the
  page is left. A 4,096 px canvas holds about 64 MB.
- The canvas has `tabIndex=0` and an `aria-label` that names the keys, and a
  help line below it. It has no ARIA role, because the lint rules treat a canvas
  as interactive and `application` as not. Screen reader users in browse mode may
  need to switch to focus mode for the arrow keys.
- On touch, a tap picks when the finger lifts. Dragging a finger scrolls the page,
  as it does anywhere else, and changes nothing, so drag-to-scrub is for mouse
  and pen. The canvas is `select-none`, so a mouse scrub does not select text.
- The frame around the canvas is given its width outright (the image's own width
  at most, the room there is, and no taller than 60% of the screen). The canvas
  fills it, so the canvas and the cursor marker are always the same box.

## Limits

- The browser must decode the file. HEIC and other unsupported formats fail with
  "Couldn't open this file as an image." An animated GIF uses its first frame.
- EyeDropper is Chromium only. Elsewhere the button is absent and the other two
  ways still work.
- Wide-gamut colors are converted to sRGB when read.
- Not built: alpha, named colors, nudging lightness or chroma, and reading a
  color pasted as text outside the box.

## Tests

`parse.test.ts` checks every accepted form, every hue unit (including radians),
clamping (an out-of-gamut OKLCH to exact channels), alpha, separators, numbers too
large to be numbers, a list of refused strings, and that everything `formatColor`
writes reads back: HEX and RGB exactly, HSL within 3 steps and OKLCH within 2 (they
are written rounded). `sample.test.ts` checks pointer to pixel scaling (including
that it rounds down inside a pixel) and its edges, arrow keys and the clamp at
every edge, pixel reads and the opacity cut-off, and the readout window.
`oklab.test.ts` checks that `oklchToOklab` undoes `oklabToOklch`. `picked.test.ts`
checks order, repeats and the limit. `paint-image.test.ts` stubs
`createImageBitmap` to check the size limit, decode failure, that the bitmap is
closed when drawing fails, the shrink, and a browser that ignores it.
`eye-dropper.test.ts` stubs `window.EyeDropper` to check a pick, Esc (no error),
and failures.

The tests do not cover the page or the canvas, which need a browser. Before
relying on a change to either, in a real browser: drop a PNG, a transparent PNG,
a large JPG (over 4,096 px) and a pasted screenshot. Click, drag and use the
arrow keys, and compare the picked HEX with the image in a design tool. Try
EyeDropper in Chrome. Check the Blue + Sapphire chip next to Teal in Mocha.

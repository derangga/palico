# Palette extractor

`/palette-extractor` finds the main colors of an image. Drop in a file, paste
a screenshot or choose one, and the page shows up to ten colors with their share
of the picture. Click a color to copy it as HEX, RGB, HSL or OKLCH, or copy the
whole palette as CSS variables. It runs on the device and works offline, because
the code is bundled with the app. There is no color dependency.

It is the first tool in the Color category (Blue + Sapphire). A tool that returns
a changed image belongs in Image. A tool that reads colors or helps pick them
belongs in Color.

## Flow

1. `readPaletteFromFile` (`src/lib/color/worker-client.ts`) checks the size (25
   MB, the same limit as the image tools) and sends the bytes to
   `src/workers/palette.worker.ts`. The worker is created per call and ends when
   the read finishes, fails or is aborted.
2. The worker decodes the file with `createImageBitmap` and draws it to an
   `OffscreenCanvas` at most 200 px on the long side. Color statistics do not
   need detail, and 30,000 pixels cluster in a few milliseconds.
3. `extractPalette` (`src/lib/color/palette.ts`) turns those pixels into colors.
   It is pure and synchronous, so it runs in the worker and in plain node for
   the tests.
4. The page keeps one result card through reading, found and failed, so the
   layout does not jump. Only the newest read may write its result, and starting
   a new read (or leaving the page) aborts the old one. A hidden live region
   announces the count, and focus moves to the result title.

## Algorithm

1. **Bucket.** Every pixel at least half opaque goes into one of 4,096 bins (4
   bits per channel). A bin keeps its pixel count and the mean of its pixels, so
   a photo collapses to a few thousand weighted points.
2. **Seed.** The heaviest point is the first seed. Each next seed is the point
   with the highest weight times squared distance from the seeds so far. A heavy
   color far from the rest wins, a lone noisy pixel does not. There is no random
   number anywhere, so the same image always gives the same palette.
3. **Cluster.** Weighted k-means in OKLab for up to 12 iterations. OKLab
   distances match how different two colors look, which RGB distances do not.
4. **Merge.** Clusters closer than 0.05 in OKLab fold into the heavier one, at
   their weighted average, so the palette does not list three near-identical
   blues. A merged center moves, so the pass repeats until nothing more folds.
5. **Trim.** Clusters under 0.5% of the visible pixels are dropped, the rest are
   sorted by area, and the result is capped at ten. The count control on the page
   shows the first 4, 6, 8 or 10 of that list, so changing it is instant and
   does not read the image again.

A color in the result is the OKLab center of its cluster, converted back to sRGB
and clamped. Share is the cluster weight over all visible pixels.

## Formats

`format.ts` writes all four from one RGB value. HEX is lowercase. RGB and HSL use
commas, which every design tool accepts. OKLCH is the CSS form with unitless
lightness, `oklch(0.628 0.258 29.2)`; a gray gets hue 0. The CSS export is a
`:root` block with `--palette-1`, `--palette-2` and so on in the chosen format.

## UI notes

- The swatch is a plain block with the value underneath, not text on the color.
  Text on an arbitrary color cannot promise 4.5:1, and this way it never needs
  to.
- Swatch colors are inline styles because they come from the image. Everything
  around them uses theme tokens.
- Copying shows "Copied" over the value for 1.8 seconds (the value keeps its
  space, so a wrapped OKLCH value does not change the row height) and announces
  it to screen readers, for a swatch and for the CSS button. There is no toast on
  success, because people click several swatches in a row. A failed copy still
  shows an error toast.
- The color strip above the swatches divides each flex-grow by the sum of the
  shown shares. The shares add up to less than 1 (specks are dropped, and the
  count control hides the smaller colors), and flexbox would leave the strip
  partly empty.
- While an image is being read the card shows a Cancel button. It aborts the
  read, which ends the worker, and returns to the picker.
- A file with a known non-image type is refused with a message. A file with no
  type at all (some systems report none for HEIC or AVIF) goes to the decoder,
  which accepts or refuses it.
- The swatches fan in 30 ms apart through `animate-pop-in`, once per result. The
  press scale on a swatch is the only other motion, and `motion-reduce` removes
  it.
- The number-of-colors control is hidden when the image has no more colors than
  the smallest count.

## Limits

- The browser must be able to decode the file. HEIC and other formats it cannot
  open fail with "Couldn't open this file as an image." An animated GIF uses its
  first frame.
- The worker decodes the file at full size before shrinking it, like the other
  image tools, so a very large image needs memory for its full pixels. The 25 MB
  file limit is the only guard.
- Wide-gamut photos are converted to sRGB when decoded.
- Shrinking a large photo straight to 200 px can alias thin detail. That is fine
  for color statistics, but a one-pixel line may not count.
- Ranking is by area, so a large flat background comes first.
- Not built: CSS color names. Picking a single color from an image is the
  [color picker](color-picker.md).

## Tests

`oklab.test.ts` checks black, white and sRGB red against published OKLab values,
round-trips a spread of colors, and checks clamping and the gray hue rule.
`format.test.ts` checks every format against known values (tomato is
`hsl(9, 100%, 64%)`), including a hue that rounds up to 360. `palette.test.ts`
builds pixel buffers from runs of one color and checks shares, ordering,
transparency and the half-opacity cutoff, the weighted merge, both sides of the
speck cutoff, the cap (with twelve colors checked to be distinct), jittered
shades averaging back to their source colors, a gradient, determinism, pixel
order and noise.

The tests do not cover the worker or the page, which need a browser. Before
relying on a change to either, drop a PNG, a transparent PNG, a large JPG and a
pasted screenshot onto the page and compare the swatches with the image.

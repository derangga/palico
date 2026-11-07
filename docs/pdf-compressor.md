# Compress PDF

The tool at `/pdf-compress` makes one PDF smaller in bytes, entirely in the
browser. Text stays text: it is never rasterised, so it stays sharp and
searchable. The saving comes from shrinking the images and from rewriting the
file without waste.

## Flow

1. The user drops one PDF (50 MB, 100 pages, the shared PDF limits in
   `src/lib/file/pdf-types.ts`). `loadPdf` renders the cover thumbnail and
   counts pages, the same as PDF to Images, so a too-big, too-long or locked
   file fails before the user picks anything.
2. They pick a preset (default Balanced) and press **Compress PDF**.
3. `compressPdf` (`src/lib/file/pdf.ts`) checks the size, reads the file, and
   sends a `compress` request to the PDF worker (`src/workers/pdf.worker.ts`).
4. The worker runs the two passes below, posting one `compress-progress` per
   image, then `compressed` with the bytes and the image counts.
5. `chooseOutcome` (`pdf-compress-result.ts`) compares sizes on the main
   thread and returns a `CompressOutcome`: `Compressed` or `NotSmallerResult`.
6. The result card shows `before → after · N% smaller`, a Save button, and one
   line about the images ("Images recompressed: 12. Left as they were: 3.").
   Nothing downloads by itself.

One file at a time, not a batch. PDF to Images, Organize and the video
compressor work on one file, and a PDF run holds the whole document plus a
decoded image in the worker, so two at once would double the memory peak.
Changing the preset clears the result, so a card never shows numbers from a
setting that is no longer selected.

## Presets

| Preset | Images | Lossless pass |
| --- | --- | --- |
| Light | untouched | yes |
| Balanced (default) | down to 150 DPI, JPEG quality 0.75 | yes |
| Small | down to 100 DPI, JPEG quality 0.6 | yes |

The values live in `PRESETS` (`pdf-compress-presets.ts`). They are the starting
values from the spec and have not been tuned against a corpus of real PDFs.
There is no page-rasterising preset: that would turn text into pixels, which
is what this tool promises not to do.

## Pass 1: images

`recompressImages` in `src/lib/file/pdf-compress.ts`, with pdf-lib.

1. **Collect.** `collectImages` walks every page's `/Resources /XObject`, going
   into Form XObjects' own resources (each form once per page, so a form that
   draws itself cannot loop). An image is collected once however many pages or
   forms use it. Images reachable only from annotations, patterns, soft-mask
   forms or Type3 fonts are never visited, so they are left untouched.
2. **Probe.** Once, before the first image, `codec.probe()` checks that this
   browser can run the codec: `OffscreenCanvas` exists, a 1x1 canvas encodes to
   `image/jpeg`, and `createImageBitmap` accepts the decode options. If it
   rejects `colorSpaceConversion` the probe retries without it, since the
   untagged JPEGs in a PDF decode to the stored pixels anyway; `imageOrientation:
   "none"` is not optional (a phone photo would turn), so rejecting it fails the
   probe. A failed probe fails the pass with `PdfCompressError` (`images`) and
   the message "This browser can't shrink the images in a PDF. Try Light, ...".
   Without it every image would fail the same way, be counted as skipped, and the
   result would read "already as small as it gets". A PDF with no candidate
   images, and the Light preset, never probe.
3. **Plan.** `planImage` (`pdf-image-raster.ts`, pure, tested) reads the image
   dictionary and decides.
4. **Re-encode** one image at a time, so the worker holds a single decoded
   image.
5. **Replace** the stream only if the new bytes are fewer than the old.

What is re-encoded:

| Source | How |
| --- | --- |
| JPEG (`DCTDecode`), `DeviceGray`, or RGB (`DeviceRGB`, `CalRGB`, ICC with 3 components) | `createImageBitmap` with `resizeWidth`/`resizeHeight`, drawn on an `OffscreenCanvas`, `convertToBlob("image/jpeg", quality)` |
| 8-bit `FlateDecode` in the same colour spaces, no predictor, TIFF 2 or PNG 10 to 15 | `fflate.unzlibSync`, `unpredict`, `toRgba`, then `createImageBitmap(ImageData, resize)` and the same encode |

Skipped, and counted as skipped: CMYK, Indexed, Lab, spot colour, `CalGray` and
ICCBased gray (see Colour details), ICCBased with a component count other than
3, 16-bit or 1-bit Flate, JBIG2, JPX, CCITT, LZW, any filter chain, `ImageMask`,
`Decode` arrays, colour-key `/Mask` arrays, images whose `SMask` has a `/Matte`,
images used as another image's `SMask`/`Mask`, streams under 8 KB, and images
over 20 million pixels. A Flate image whose inflated length does not match what
its dictionary promises is also skipped, as is one that fails to decode. A
single failing image never fails the pass.

### Memory

`MAX_IMAGE_PIXELS` is 20 million: a decoded image is 4 bytes a pixel as RGBA,
with the inflated samples beside it while it is built. Flate data is inflated
with `unzlibSync(data, { out })` into a buffer sized from the dictionary
(`expectedInflatedBytes`: samples, plus one filter byte per row for PNG
predictors) plus one spare byte. A stream that inflates to more than it claims
fills the spare byte and is skipped, so a decompression bomb never grows past
the size its image dictionary states. The inflated bytes live only inside
`unpredictedSamples`, so they can be collected before the RGBA copy is encoded.
The codec frees each canvas (`width = height = 0`) in a `finally`, including
after a failed encode.

### The DPI cap

v1 caps pixels by page size and does not read the content stream:

```
long  = page long side  in inches × maxDpi
short = page short side in inches × maxDpi
```

`fitToBudget` compares the image's long side to the page's long side and its
short side to the short one, so a landscape photo, a portrait photo, a page on
its side and an image placed turned by 90 degrees all get the same scale. It
keeps the aspect ratio and never upscales. The page box is the CropBox
(MediaBox when absent), multiplied by the page's `/UserUnit` (1 when absent).
An image shared by several pages uses the biggest budget of those pages. The cap
is generous on purpose: an image drawn at half a page is still kept at page
resolution, and a landscape photo on a portrait page is capped a little looser
than the drawn size would allow. Reading each `cm` transform to cap by drawn size
is the first thing to add.

### Soft masks

An image with an `SMask` is downscaled like any other, and the `SMask` is left
exactly as it was. The PDF spec lets a mask have its own width and height; the
viewer stretches it over the image's unit square. So shrinking the colour image
alone is valid, and the alpha keeps its full resolution. Downscaling the mask
too would save more on images with large masks; it is not done because a
`/Matte`, an `/SMaskInData` or a mask shared by several images each need their
own rules.

Which images are masks is decided by scanning every image stream in the file for
an `/SMask` or `/Mask` reference (`findMaskRefs`), not only the owners a page
reaches, so a mask stays bound to its owner even when the owner hangs off an
annotation or a pattern.

### Colour details

- Only `DeviceGray` is converted: it comes back as an RGB JPEG, because canvas
  only writes colour JPEGs, and the image's `/ColorSpace` is set to `DeviceRGB`
  so the stream and the dictionary agree. A device space has no tone curve, so
  r = g = b keeps the grays as they were. It is kept only if still smaller.
- `CalGray` and ICCBased gray (one component) are skipped, for JPEG and Flate
  alike. They carry a tone curve, and relabelling them `DeviceRGB` would shift
  how the grays look. RGB spaces keep their own colour space and are fine.
- JPEGs are decoded with `imageOrientation: "none"` and
  `colorSpaceConversion: "none"`. A PDF ignores EXIF orientation and applies its
  own colour space, so the pixels must come out as stored.
- An ICCBased colour space keeps its profile object. Re-encoding does not touch
  it.

## Pass 2: lossless

`pdfLibLosslessPass` is the only function the worker calls for this pass, so
swapping it is a one-function change (`type LosslessPass`). Today it:

1. Deletes every object the trailer cannot reach (`dropUnreferencedObjects`).
   pdf-lib writes back everything it parsed, so replaced images, orphaned
   objects and old cross-reference streams would otherwise stay in the file.
2. Deflates every stream that is stored without a filter, when that is smaller
   (`deflateRawStreams`). Some generators write page content uncompressed.
   Streams with `/Type /Metadata`, `/Type /XRef`, `/Type /ObjStm` or
   `/Subtype /XML`, and the one the catalog's `/Metadata` points at, are left
   unfiltered, because tools that look for an XMP packet read its bytes as
   stored.
3. Saves with `useObjectStreams: true`, `addDefaultPage: false` and
   `updateFieldAppearances: false`. Documents load with `updateMetadata: false`
   so pdf-lib does not stamp its own Producer and ModDate.

**Planned: swap this pass for qpdf** (`--object-streams=generate
--recompress-flate`, plus linearisation if wanted). pdf-lib re-serialises
dictionaries more loosely than a PDF written by pdfTeX or Word, so on an
already-tight PDF the Light preset can come out a little bigger (a 141 KB
pdfTeX manual came out 1% bigger in testing). That is exactly the case the
"never hand back a bigger file" rule covers, and qpdf should shrink it. When
the swap lands, pass 1 will save its document to bytes first and hand those to
qpdf.

Rewriting the file does not preserve **digital signatures** (a signature covers
exact bytes) or **PDF/A conformance** (the identification and metadata the
standard requires are re-serialised and unfiltered streams may change). The page
says so under the button.

## Progress and cancel

The worker posts one `compress-progress` per image. The page shows `Image 3 of
12` as a determinate bar while images are being re-encoded, and an
indeterminate striped bar with "Getting ready…" before the first count and
"Finishing…" once the last image is done, for a PDF with no images, and for
Light (which has no image pass), so there is always visible progress.

**Cancel** is shown while a run is going. The run is an Effect started with an
`AbortSignal` (`Effect.runPromiseExit(effect, { signal })`); aborting interrupts
the fiber, and `runWorkerJob`'s `acquireUseRelease` terminates the worker. The
page also aborts on unmount. An interrupted run is not an error: no toast, no
result.

## Never return a bigger file

If the output is the same size or larger than the input, `chooseOutcome`
returns `NotSmallerResult`. It is a normal outcome on the success channel, not
an error. The card says "This PDF is already as small as it gets.", explains
that the original is untouched, offers **Save original**, and on Light or
Balanced suggests a stronger setting. `NotSmallerResult` has no `blob` field, so
the page cannot hand the bigger file back by mistake.

## Errors

All are tagged errors on the Effect error channel (`src/lib/file/errors.ts`).

- `PdfCompressError` has a `stage` (`images` or `lossless`) and means a whole
  pass failed. One image that will not decode is not this error. The `images`
  stage is also what a browser without a working codec raises (see the probe),
  with its own message.
- `EncryptedPdfError` for a password-protected PDF. The page shows a panel, not
  a toast, with the message "This PDF is password-protected. Unlock it first,
  then compress it." and a link to `/pdf-password?mode=unlock`. The link is a
  plain `<a>` because that route is built separately and is not in the typed
  route tree yet. Switch it to `<Link>` once the route exists.
- `PdfTooLargeError`, `PdfTooManyPagesError`, `InvalidPdfError` and
  `PdfWorkerError` come from the shared worker runner, as in the other PDF
  tools.

`PdfCompressError` is part of the `PdfLoadError` union so every worker job keeps
one error type.

## Tests

- `pdf-compress-presets.test.ts`: the preset table, the DPI budget, the fit
  and no-upscale maths, "smaller" and percent saved.
- `pdf-image-raster.test.ts`: `planImage` for every skip rule, `unpredict`
  against an independent PNG and TIFF encoder (all five PNG filters), `toRgba`.
- `pdf-compress.test.ts`: builds small PDFs with pdf-lib and runs both passes
  with a fake `ImageCodec` (node has no `createImageBitmap`). It covers shared
  images, Form XObjects, a self-referencing form, Flate with a PNG predictor,
  gray, soft masks (including a mask whose owner no page reaches), CMYK and
  masks, failing and growing re-encodes, a rotated page, `/UserUnit`, an
  over-long inflate, the codec probe, progress, orphan removal, raw-stream
  deflate, XML and catalog metadata left raw, and `chooseOutcome`.

A throwaway script with `sharp` standing in for the browser codec ran both
passes on a PDF with real JPEG, gray JPEG and RGBA PNG images and on a pdfTeX
manual; pdf.js opened and rendered the outputs. The browser codec itself
(`pdf-image-codec.ts`) has not run in a real browser yet.

## Not done

- Reading content-stream transforms to cap images by drawn size.
- Downscaling soft masks.
- Rasterising pages (a "scan" preset). It would defeat searchable text.
- CMYK, Indexed, 16-bit, JBIG2 and JPX images, and calibrated or profiled gray.
- Images reachable only from annotations, patterns, soft-mask forms or Type3
  fonts. They are left untouched.
- Keeping digital signatures or PDF/A conformance.
- Batches and a before/after preview.
- Font subsetting or removal of unused fonts, and the qpdf swap above.

## File reference

| File | Responsibility |
| --- | --- |
| `src/routes/pdf-compress.tsx` | Page: drop, presets, run, locked-PDF panel |
| `src/components/pdf-compress/result-card.tsx` | Compressed and NotSmallerResult cards |
| `src/lib/file/pdf-compress-presets.ts` | `PRESETS`, `pixelBudget`, `fitToBudget`, `isSmaller` (no Effect, worker-safe) |
| `src/lib/file/pdf-image-raster.ts` | `planImage`, `unpredict`, `toRgba` (pure, worker-safe) |
| `src/lib/file/pdf-compress.ts` | pdf-lib walker, `recompressImages`, `pdfLibLosslessPass`, `ImageCodec` port |
| `src/lib/file/pdf-image-codec.ts` | Browser `ImageCodec` (createImageBitmap, OffscreenCanvas) |
| `src/lib/file/pdf-compress-result.ts` | `CompressOutcome`, `chooseOutcome` |
| `src/lib/file/pdf.ts` | `compressPdf` Effect |
| `src/lib/file/pdf-worker-client.ts` | `compressPdfInWorker`, error mapping |
| `src/workers/pdf.worker.ts` | `compress` handler |

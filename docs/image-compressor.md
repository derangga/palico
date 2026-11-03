# Compress Image

The tool at `/compressor` makes JPG, PNG and WebP files smaller in bytes
without changing their width and height. The resizer changes pixel dimensions;
this tool changes how the same pixels are encoded.

## Flow

1. The user drops up to 10 images (`MAX_FILES`), each up to 25 MB and 8000px.
2. They pick a quality (slider 10 to 95, default 75, or a Small 50 / Balanced
   75 / Best 90 preset), an output format, and optionally "Keep each file
   under N KB".
3. "Compress N" runs `compressImages` in `src/lib/image/compressor.ts`: five
   files at a time, each result a `Result`, so one bad file does not stop the
   rest. Errors are the image pipeline's tagged errors (`ConvertError`).
4. Each row shows `before → after (format) · N% smaller`. A line above the list
   totals the bytes saved. Done files save one by one or as
   `palico-compressed.zip`. "Compare" opens a before/after split view
   (`src/components/compressor/compare-panel.tsx`).

Changing any setting sends finished rows back to ready, so a row never shows a
result from settings that are no longer on screen.

## Output format

| Choice | JPEG in | WebP in | PNG and others in |
| --- | --- | --- | --- |
| Same as original (default) | JPEG | WebP | WebP |
| JPG | JPEG | JPEG | JPEG |
| WebP | WebP | WebP | WebP |

PNG output is never produced. `OffscreenCanvas.convertToBlob` ignores
`quality` for PNG, so a PNG re-encode rarely gets smaller. Real PNG
compression needs palette quantization (libimagequant, oxipng), which means a
wasm dependency and a separate worker for one format. WebP keeps transparency
and is usually far smaller, so PNG goes to WebP instead. Revisit this if users
ask for PNG output by name.

JPEG has no alpha channel, and canvas encodes transparent pixels as black. When
the target is JPEG the compressor sets `fillWhite`, and the worker paints the
canvas white before drawing. The converter does not set it.

## The size limit: a quality search in the worker

With a size limit, the slider value becomes the ceiling, and
`searchQuality` (`src/lib/image/quality-search.ts`) looks for the highest
quality whose output fits:

1. Encode at the ceiling. If it fits, stop (1 pass).
2. Encode at the floor, 0.10. If even that is too big, return it with
   `targetMet: false` (2 passes).
3. Binary search between the two, keeping the best fitting blob.

`COMPRESS_MAX_PASSES` caps the total at 8 encodes: 2 bracketing passes plus 6
halvings, which lands within about 0.014 of the best quality over the full
range. The search runs inside `src/workers/image-converter.worker.ts`, so the
image is decoded once and only re-encoded per pass. `quality-search.ts` does not
import Effect, to keep the worker bundle small, and it has a vitest suite with a
fake encoder.

When the limit is not met the file still counts as done. The row says it could
not get under the limit, and the summary links to the Image Resizer, because
fewer pixels is the only way left to shrink it.

## Never return a bigger file

If the encoded output is the same size or larger than the input, `compressOne`
returns the original `File`, with its original name and extension, and the row
says "Already small, kept the original." This applies even when the format
changed: a PNG that would grow as WebP stays a PNG. Compare is hidden for
those rows.

## Browsers that can't encode a format

`convertToBlob` does not fail on a type it can't encode. It silently returns a
PNG. Safari has lacked WebP canvas encoding. The worker checks
`blob.type !== req.mime` and fails with an `encode` error ("This browser can't
save WEBP images. Choose JPG.") instead of saving a PNG under a `.webp` name.
The check sits in the shared worker, so the converter and resizer get it too.

## Metadata

Re-encoding through canvas drops EXIF, XMP and ICC data. `createImageBitmap`
applies EXIF orientation before drawing, so photos stay upright. A file kept as
the original keeps its metadata, so the page does not promise metadata removal.
Use Remove Metadata (`docs/metadata-stripper.md`) for that.

## Not done

- PNG output and palette quantization.
- AVIF output (`convertToBlob` support is patchy).
- Cancelling a running batch (the converter does not have it either).
- A shared batch helper for `convertImages` and `compressImages`. The loop is
  about 30 lines in each; extract it when a third caller appears.

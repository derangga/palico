# Remove Metadata

The tool at `/strip-metadata` shows the hidden data in a photo or PDF, removes
it on the device, and reads the new file again to confirm nothing is left.

## Flow

1. The user drops up to 10 files. `inspectFile` in `src/lib/metadata/metadata.ts`
   reads each one as soon as it lands.
2. Each row lists what was found, grouped as Location, Device, Dates, People,
   Software and Other. A photo with GPS coordinates gets a warning line.
   Files with nothing to remove show "Nothing hidden" and stay out of the batch.
3. "Remove metadata (N)" runs `stripFile` on each file. It strips, then reads
   the output with the same reader. If anything removable is still there it
   fails with `MetadataStillPresentError`; the row never says "Clean" without
   that second read passing.
4. Clean files download one by one or as a zip (`createZip`).

Batches run three files at a time (`forEachFile`), and each file's result is
a `Result`, so one bad file does not stop the rest.

## Images: JPEG, PNG, WebP

`src/lib/metadata/image-read.ts` walks the container structure and never
decodes pixels:

| Format | Removed | Kept |
| --- | --- | --- |
| JPEG | APP1 (EXIF, XMP), APP13 (IPTC), COM, APP3 to APP15 except APP14, non-ICC APP2 (MPF) | SOI, APP0 (JFIF), APP2 ICC profile, APP14 (Adobe colour transform), everything from DQT/SOF on |
| PNG | `eXIf`, `tEXt`, `zTXt`, `iTXt`, `tIME`, bytes after `IEND` | every other chunk, unchanged with its CRC |
| WebP | `EXIF`, `XMP ` | every other chunk; the EXIF and XMP bits in `VP8X` are cleared and the RIFF size rewritten |

The EXIF reader handles both byte orders and reports camera make and model,
lens, serial number, owner, artist, copyright, software, dates, GPS
coordinates and altitude. Other tags show up as a count ("Camera settings: 23
more tags"), and an embedded thumbnail is reported because it can show the
uncropped original.

### Why byte surgery, not canvas re-encode

`src/workers/image-converter.worker.ts` already drops metadata as a side
effect of decoding and re-encoding. That path costs a JPEG generation and
drops the ICC profile, so wide-gamut photos shift colour. `image-strip.ts`
copies the kept segments and the compressed image data as they are, so the
output is pixel-identical and only shrinks by the metadata size.

### Orientation

Phones store portrait photos as landscape pixels plus an EXIF Orientation tag.
Dropping the tag would show them sideways. When a JPEG's Orientation is not 1,
the stripper writes `minimalExifApp1`, a 36-byte APP1 holding only that tag,
where the old EXIF was. The reader treats a lone Orientation tag as kept, not
as metadata. PNG and WebP lose the tag; cameras write JPEG, so this is rare.

### Main thread, not a worker

CLAUDE.md puts image work in workers to keep decoding off the UI thread. This
path decodes nothing: the JPEG walk stops at SOS and PNG/WebP walk chunk
headers, then one copy builds the output. If that ever shows up as jank on
large files, wrap `readImageMetadata` and `stripImageMetadata` in a worker;
their API does not change.

## PDFs

`src/lib/file/pdf-metadata.ts` holds the pdf-lib logic and runs inside
`src/workers/pdf.worker.ts` through the `read-metadata` and `strip-metadata`
requests (`src/lib/file/pdf-types.ts`).

- Documents load with `updateMetadata: false`. pdf-lib's default stamps its
  own `Producer` and `ModDate` on every save.
- Stripping deletes the trailer `/Info` dictionary, every stream with
  `/Type /Metadata` (document and page XMP), and every `/Metadata` key that
  pointed at one.
- It also deletes orphaned info dictionaries. pdf-lib writes back every object
  it parsed, so an Info dictionary from an earlier incremental save would
  otherwise survive. An orphan is any untyped dictionary with Author, Creator,
  Producer, CreationDate or ModDate.
- Encrypted PDFs fail with the existing `EncryptedPdfError`.

## Not covered

- HEIC, AVIF, TIFF, GIF and SVG. HEIC is the obvious next format (iPhone
  default) and needs an ISOBMFF box walker.
- XMP contents are reported by size only, not parsed.
- Selective removal (keep the date, drop the location).
- PDF trailer `/ID`, `/PieceInfo`, annotation authors, form values, embedded
  files.
- Office documents and video metadata.
- Split PDF and Merge PDFs still load with pdf-lib's default
  `updateMetadata: true`, so their output carries `Producer: pdf-lib`.

## Tests

- `src/lib/metadata/image-read.test.ts`, `image-strip.test.ts`: byte fixtures
  from `src/lib/metadata/fixtures.ts`.
- `src/lib/file/pdf-metadata.test.ts`: PDFs built with pdf-lib, including an
  orphaned info dictionary.

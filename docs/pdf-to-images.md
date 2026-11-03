# PDF to Images

The tool at `/pdf-to-images` saves every page of a PDF as a PNG or JPG,
downloaded as one zip.

## Flow

1. The user drops one PDF (50 MB and 100 pages, the shared `MAX_PDF_BYTES` and
   `MAX_PDF_PAGES`). `loadPdf` renders only the first page (`thumbnailLimit:
   1`), which shows the cover and proves the file opens before any real work.
2. They pick PNG (default) or JPG, and 72, 150 (default) or 300 DPI.
3. "Convert & download zip" runs `pdfToImages` in `src/lib/file/pdf.ts`, which
   sends a `rasterize` request to `src/workers/pdf.worker.ts`. A progress bar
   shows pages done. The zip is `<name>_images.zip` with members
   `<name>_page_07.png`, zero-padded to the page count so they sort.

PNG is the default because most PDFs are text, and JPEG blurs text edges. JPG
uses quality 0.92, the same as the image converter.

## Resolution

PDF user space is 72 units per inch, so the render scale is `dpi / 72`
(`rasterSize` in `src/lib/file/pdf-raster.ts`). At 150 DPI an A4 page is
1240 x 1754 px: sharp on any screen and readable when printed. 300 DPI is for
print.

iOS Safari refuses canvases over 4096 x 4096 px of area. A page that would
exceed it is scaled down on its own to fit (`MAX_RASTER_PAGE_PIXELS`). A4 at
300 DPI is 8.7 M px, so only large-format pages (A2 and up) hit this.

## Memory

The worker holds at most one page canvas and one encoded page at a time:

1. A pre-pass sizes every page without rendering (`getViewport` only). If the
   total is over `MAX_RASTER_TOTAL_PIXELS` (250 M px), the job fails before any
   work with `PdfRasterBudgetError`, whose message suggests a lower DPI. 250 M
   px fits 100 A4 pages at 150 DPI, or about 28 at 300 DPI.
2. Each page renders onto a fresh `OffscreenCanvas` filled white (JPEG has no
   alpha, and a transparent PNG page looks broken in most viewers), encodes
   with `convertToBlob`, then the canvas is shrunk to 0 x 0 to free it.
3. The encoded page goes into fflate's streaming `Zip` as a `ZipPassThrough`
   entry (stored: PNG and JPEG are already compressed). Every chunk fflate
   emits is copied and transferred to the main thread as a `zip-chunk`
   response, so the worker keeps nothing.
4. The main thread collects the chunks into a Blob. Chrome can page a large
   Blob to disk.

fflate emits the final chunk synchronously from `zip.end()`, so the worker's
`done` message always arrives after the last chunk.

The zip itself still has to sit in memory until download. That is what the
pixel budget bounds.

## Not done

- **Converting only some pages.** Use Organize PDF first, then this tool.
- **Streaming to disk with `showSaveFilePicker`.** Chromium only. It would
  remove the pixel budget there.
- **PDF compression.** Needs qpdf or Ghostscript in wasm. A later idea.

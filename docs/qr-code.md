# QR codes

Two tools share one library in `src/lib/qr/`. `/qr-generator` turns text into a
code and saves it as PNG or SVG. `/qr-reader` finds a code in a photo,
screenshot or camera feed and shows what is inside. Both run on the device and
work offline, because the whole library is bundled with the app.

There is no QR dependency. The encoder and decoder are written here, so the
bundle stays small and nothing about the format is hidden in a package.

## Generator

1. The page keeps the text in state and passes `useDeferredValue(text)` to
   `encodeQr`. Typing stays instant, and the preview dims while a large code
   catches up.
2. `encodeQr` (`encode.ts`) picks the densest mode that holds the whole text
   (numeric, alphanumeric, else UTF-8 bytes), the smallest version that fits at
   the chosen error correction level, then tries all eight masks and keeps the
   one with the lowest penalty score. It fails with `QrCapacityError` when
   nothing fits (2,953 bytes at level L, version 40).
3. `render.ts` draws the symbol. SVG output merges each horizontal run of dark
   modules into one rectangle. PNG output scales by a whole number of pixels
   per module, so edges stay sharp, and draws on an `OffscreenCanvas`.
4. Save PNG, Save SVG and Copy image each show a working, success and error
   state. Failures arrive as typed errors (`QrRenderError`, `FileDownloadError`,
   `ClipboardWriteError`) and `toastOnExit` shows the message.

### Guidance

`guidance.ts` holds the advice, as pure functions so the page can recompute it
on every keystroke:

| Check | Severity | Trigger |
| --- | --- | --- |
| Too long | error | Text does not fit at this level. Says the exact limit. |
| Low contrast | warning | WCAG ratio under 3:1 between the two colors. |
| Inverted | warning | Code color lighter than the background. |
| Bare link | tip | Looks like `example.com/path` with no scheme. |
| Dense | tip | Version 13 or higher. Gives a minimum print width. |

The static "Making it scannable" checklist is `SCAN_TIPS`. The print width rule
is 0.4 mm per module, including the 4-module quiet zone, never under 1.5 cm.

The quiet zone is fixed at 4 modules, the spec minimum. It is not an option,
because a thinner one is the most common reason a printed code fails.

## Reader

1. A file goes to `readQrFromFile` (`worker-client.ts`), which checks the size
   (25 MB, the same limit as the image tools), then sends the bytes to
   `src/workers/qr-decode.worker.ts`. The worker decodes the image with
   `createImageBitmap`, draws it to an `OffscreenCanvas` capped at 4096 px on
   the long side, and runs `decodeFrame`.
2. The result card keeps one shape through reading, found and failed, so the
   page does not jump when the decode finishes. Only the newest read may write
   its result, and starting a new read (or leaving the page) aborts the old
   one, which ends its worker. A hidden live region announces "QR code found"
   for screen readers, and focus moves to the result title.
3. Pasting an image anywhere on the page (Ctrl or ⌘ + V) reads it too.

### Decoding pipeline

`decode.ts` is pure and synchronous. It runs in the worker, and in plain node
for the tests.

1. **Gray and shrink** (`binarize.ts`). Transparent pixels count as white.
   Images over 2,000 px on the long side are box-averaged down first. Shrinking
   can alias thin modules (3 px modules halved to 1.5 px), so a thorough pass
   also tries the original pixels, then smaller copies at half and quarter
   size.
2. **Binarize.** Three strategies: a local-mean threshold over a window about a
   quarter of the long side wide, one global Otsu threshold, and a local-mean
   threshold over a window about a sixteenth wide. Photos have uneven light,
   so the decoder tries each.
3. **Find finders** (`finders.ts`). A row scan looks for the 1:1:3:1:1 run
   pattern. Each hit is confirmed down the column and back along the row.
   A hit that fails confirmation keeps its run history, because the real
   pattern can start inside it.
4. **Pick a triple.** Any three finders forming a right isosceles triangle with
   similar module sizes, best score first. The limits are loose because
   perspective bends the angle.
5. **Transform** (`geometry.ts`). Module coordinates map to pixels through a
   homography. From version 2 up, the decoder searches near the predicted spot
   for the bottom-right alignment pattern and uses it as a fourth true point,
   which follows perspective. If that fails it falls back to a parallelogram
   guess from the three finders.
6. **Sample.** Five taps per module, majority vote.
7. **Read** (`read-symbol.ts`). Format info is matched against all 32 valid
   words (two copies, up to 3 flipped bits). Then unmask, undo the interleave,
   run Reed-Solomon per block, and parse the segments.

Version guesses come from the finder spacing, nearest first, plus or minus two.
A wrong guess fails Reed-Solomon and the next one is tried.

`effort` picks how hard to try. `"thorough"` (files) runs all three
binarizers, a flipped pass for light-on-dark codes, and the resolutions above.
`"quick"` (camera) runs two binarizers on one frame and does not try
light-on-dark codes, since the next frame is about 120 ms away.

### Camera

`useQrCamera` opens the rear camera, draws a frame (at most 960 px wide) to a
canvas about eight times a second, and sends it to a worker that stays open
for the session. Frames are skipped while the worker is busy. On the first
reading it stops the camera and shows the result.

The camera also stops when the tab is hidden (including while it is still
opening), when the device is disconnected, on Escape, and when the page
unmounts, so the camera light never stays on. A worker that crashes or sends a
bad message fails every waiting frame with a `QrWorkerError`, so the scanner
shows an error instead of sitting on "scanning". Failures map to a `CameraError`
with a reason (`denied`, `no-camera`, `in-use`, `unsupported`) and a message
that says what to do.

### What a result offers

`content.ts` classifies the text:

- **Link** (http or https only): shows the host on the Open button. The link
  never opens by itself. A plain `http` link and a host with a `xn--` label
  (a possible look-alike) get a caution line.
- **Wi-Fi** (`WIFI:T:...;S:...;P:...;;`): shows the network, security and a
  password hidden behind a toggle, and copies the password.
- **Email, phone, text**: copy only. `mailto:`, `tel:` and any other scheme
  such as `javascript:` are never offered as a link.

## Limits

- One code per image. The first one that reads wins.
- Mirrored codes are not read.
- Micro QR and rMQR are not supported.
- Structured append (a code split across several symbols) is parsed but the
  parts are not joined.
- The version number is estimated from geometry. For versions 7 and up the
  version information bits are not read, so a badly wrong estimate costs a
  retry rather than being corrected.

## Tests

`encode.test.ts` checks the tables against published values (data capacity of
version 1, character capacity of version 40, module counts, alignment
positions), the format and version words against the spec, and a Reed-Solomon
vector from the standard worked example, then round-trips text through the
symbol layer. `decode.test.ts` renders codes with `fixtures.ts` and reads them
back after rotation, color inversion, low contrast, sensor noise, blur, uneven
light, a small code in a large image, and perspective. It also checks that a
blank page, random noise and a wrecked code return nothing.

The round trips use this encoder to make the pictures, so a mistake shared by
both sides would pass. The independent checks are the published values above.
Before relying on a change to the layout code, scan a generated code with a
phone.

# Compress Video

The Compress Video tool (`/video-compressor`) shrinks one video into an H.264
MP4, entirely in the browser. It runs on the same `ffmpeg.wasm` engine as the
[video converter](./video-converter.md). People use it to get a video under an
upload limit, such as Discord's 10 MB or an email's 25 MB.

## Flow

1. The engine gate (`useEngineGate`, `VideoEnginePanel`) loads or offers the
   engine. A user who already downloaded it in another video tool skips the
   dialog.
2. The user drops one video. `CompressPanel` shows the file, two tabs (Fit a
   size, Quality), a resolution select and the expected time.
3. **Compress** loads the engine if needed and calls `compressVideo` from
   `src/lib/video/compress.ts` through a dynamic import.
4. The result card shows `before → after · N% smaller` and a Save button.
   Nothing downloads by itself.

## Settings

| Setting | Options | Default |
| --- | --- | --- |
| Fit a size | 10 MB (Discord), 25 MB (Email), 50 MB, Custom | 25 MB, or 10 MB when the file is under 25 MB |
| Quality | High (CRF 23), Medium (CRF 28), Low (CRF 32) | Medium |
| Resolution (short side) | Original, 1080p, 720p, 480p | Original |

- A file at or under 10 MB starts on the Quality tab, because no size preset
  could shrink it.
- Size presets the file is already under are disabled.
- The custom size field is checked as the user types: it must be a positive
  number below the file size.
- Sizes are decimal MB (10 MB = 10,000,000 bytes), the stricter reading of an
  upload limit. The result line uses `formatBytes`, which is binary, so a
  10,000,000-byte file shows as 9.54 MB.
- The expected time is `estimateMinutes(file.size, "mp4")` from `limits.ts`,
  the converter's estimate for the same encoder. It overestimates when a
  smaller resolution is picked.

## The ffmpeg command

`buildCompressArgs` (unit tested in `compress.test.ts`) produces:

```
-i input.<ext>
-vf <scale>
-c:v libx264 -preset veryfast -threads 2 -pix_fmt yuv420p
  size:    -b:v <B>k -maxrate <B>k -bufsize <2B>k
  quality: -crf 23 | 28 | 32
-c:a aac -b:a 96k (size) | 128k (quality)
-movflags +faststart
output.mp4
```

- `veryfast` and `-threads 2` are the converter's settings, tuned for the wasm
  memory ceiling (see `types.ts`).
- `<scale>` sets the short side, so portrait video keeps its orientation. It
  never upscales, and it rounds both sides to even numbers, which yuv420p needs:
  `scale='if(gte(iw,ih),-2,trunc(min(iw,720)/2)*2)':'if(gte(iw,ih),trunc(min(ih,720)/2)*2,-2)'`.
  Original is `scale=trunc(iw/2)*2:trunc(ih/2)*2`, so an odd-sized source
  (721×1281) becomes 720×1280 instead of failing.
- `-pix_fmt yuv420p` turns 10-bit HDR and 4:4:4 sources into 8-bit 4:2:0.
  Without it libx264 keeps the source format, and many players reject that.
- `+faststart` puts the index first so upload sites can play the video before
  it finishes loading.

## Hitting a target size

Single pass, not two-pass. Two-pass doubles the encode time in wasm and needs a
second exec plus `ffmpeg2pass-*` log files that `runFfmpegJob` does not clean
up.

`-maxrate B -bufsize 2B` caps the video at `B × (duration + 2 s)` bits.
`planVideoKbps` in `compress-options.ts` picks `B`:

```
budgetBits = targetBytes × 8 × 0.95       5% for the MP4 container
audioBits  = 96,000 × duration
B          = (budgetBits − audioBits) / (duration + 2) / 1000   kbps
```

Below 150 kbps the picture is not worth keeping, so the job fails with
`TargetTooSmallError` and the smallest size that works. The page shows it under
the size field: "This video needs at least 38 MB at this length."

Results land under the target with room to spare. In testing, a 10 MB target
gave 8.4 MB and a 1 MB target gave 0.86 MB. If a result ever goes over, the
card still offers Save and says so.

## The probe

Size mode needs the duration. The browser's `<video>` cannot read AVI or MKV,
and MediaRecorder WebM reports `Infinity`, so the job asks ffprobe instead,
inside `runFfmpegJob`'s args function. The file is staged once.

```
ffprobe -v error -show_entries format=duration -of json input.<ext> -o probe.json
```

`readProbeJson` (`probe.ts`, shared with Extract Audio) runs it, disposes the
engine if ffprobe throws, and deletes `probe.json` on every exit path.
`parseDurationProbe` decodes the JSON with Schema. A missing, `N/A` or zero
duration fails with "Could not read this video's length. Try Quality mode."

Quality mode skips the probe.

## Never return a bigger file

If the output is the same size as the input or larger, `compressOne` returns
`{ _tag: "kept" }`, and the page says "Already small, kept the original." with
no Save button. Size mode cannot get there in practice, because the target must
be below the file size before Compress is enabled.

## Limits and progress

Input files use the converter caps (`checkFileSize`: 500 MB desktop, 200 MB
mobile). The pipeline is the converter's H.264 path, and downscaling only
lowers memory.

libx264 reports progress, so the button shows a percentage. Cancel terminates
the worker, like the other video tools.

## Errors

- `TargetTooSmallError`: the size is too small for the video's length. Shown
  under the size field, not as a toast.
- `VideoCompressError`: reading, probing, encoding or reading back failed. An
  OOM says "Try 720p or a smaller file."
- `EngineNotLoadedError`: shared with the other video tools.

## Tests

`compress.test.ts` covers the pure helpers and runs `compressOne` against a
fake `EngineHandle` (an in-memory file map). It uses
`// @vitest-environment jsdom` because `fetchFile` needs `FileReader`, which
node lacks. The fake-engine cases check that a too-small target and an
unreadable length fail before any encode, that all virtual files are deleted,
that a bigger output keeps the original, and that an overshoot is flagged.

## Not covered

- Two-pass encoding.
- More than one file at a time.
- Output other than MP4, and H.265 or VP9 (VP9 aborts in core-mt per
  `types.ts`).
- Lowering the frame rate, trimming (the cutter does that), removing audio.
- A before/after preview.
- Picking a resolution automatically from the bitrate.

## File reference

| File | Responsibility |
| --- | --- |
| `src/routes/video-compressor.tsx` | Engine gate, file checks, compress and cancel |
| `src/components/video-compressor/compress-panel.tsx` | Tabs, settings, field messages, buttons, result card |
| `src/components/video-compressor/state.ts` | Settings and job state, `resolveMode` |
| `src/lib/video/compress-options.ts` | Choices, defaults, `planVideoKbps`, `checkCustomSize`, `compressedFileName` (no `@ffmpeg/*`) |
| `src/lib/video/compress.ts` | `buildCompressArgs`, `parseDurationProbe`, `compressOne`, `compressVideo` (dynamic import only) |
| `src/lib/video/probe.ts` | `readProbeJson`, shared with Extract Audio |
| `src/lib/video/compress.test.ts` | Unit and fake-engine tests |

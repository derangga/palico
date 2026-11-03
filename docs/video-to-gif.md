# Video to GIF

The Video to GIF tool (`/video-to-gif`) turns up to 15 seconds of one video into
an animated GIF, entirely in the browser. It runs on the same `ffmpeg.wasm`
engine as the [video converter](./video-converter.md) and the
[video cutter](./video-cutter.md), and it shares the cutter's preview player.

## Flow

1. The engine gate (`useEngineGate`, `VideoEnginePanel`) loads or offers the
   engine. A user who already downloaded it in another video tool skips the
   dialog.
2. The user drops one video. `useClipPlayer` shows it in `VideoClipStage`
   (preview, playback buttons, filmstrip timeline). The selection starts as the
   first 5 seconds, and the timeline's `maxSelection` keeps it at 15 seconds or
   less.
3. The side panel (`GifPanel`) sets the frame rate and the size and shows the
   output dimensions and clip length.
4. **Make GIF** loads the engine if needed and calls `makeGif` from
   `src/lib/video/gif.ts` through a dynamic import.
5. The result card shows the GIF, its size and a Save button. Nothing downloads
   by itself.

## Settings

| Setting | Options | Default |
| --- | --- | --- |
| Frame rate | 8, 12, 15 fps | 12 |
| Size (longer side) | 320, 480, 640 px | 480 |
| Clip length | 0.5 s to 15 s | first 5 s |

Size is the longer side, not the width. Most phone video is portrait, where a
640 px width would mean a GIF about 1138 px tall.

The route computes the exact output size with `fitLongSide` from the `<video>`
element's `videoWidth` and `videoHeight`. It keeps the aspect ratio and never
upscales. The browser and ffmpeg both apply rotation metadata, so the numbers
agree.

## The ffmpeg command

`buildGifArgs` in `gif.ts` (unit tested in `gif.test.ts`) produces:

```
-ss <start> -t <length> -i input.<ext>
-vf fps=<fps>,scale=<w>:<h>:flags=lanczos,setsar=1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle
-loop 0 output.gif
```

- `-ss` before `-i` is fast input seeking. Because the GIF is re-encoded, ffmpeg
  still starts on the exact frame, unlike the cutter's keyframe snap.
- `fps` and `scale` run before `split`, so the frames `palettegen` holds are
  already small.
- `split` sends the same frames to `palettegen` and `paletteuse`, so the range
  is decoded once in one exec. Two execs (palette file, then apply) would
  decode twice and need a third temp file in the job runner.
- `stats_mode=diff` and `diff_mode=rectangle` spend the palette and the bytes on
  the parts that move.

The job runs through `runFfmpegJob` (`ffmpeg-job.ts`), which deletes the
virtual files on every exit path and disposes the engine after an OOM or a
thrown exec.

## Limits and memory

`palettegen` holds every frame until the end of the range. The worst case is
15 s × 15 fps = 225 frames at 640 px: about 80 MB for 16:9 and about 140 MB for
a square source. That is why the clip and the size are capped.

Input files use the converter caps (`checkFileSize`: 500 MB desktop, 200 MB
mobile), because this tool decodes video like the converter does. The cutter's
larger caps assume nothing is decoded.

## Progress

There is no percentage. `palettegen` emits nothing until it has seen the whole
range, so ffmpeg's `time=` stays at 0 and then jumps. The button shows "Making
your GIF…" with a spinner, and Cancel terminates the worker like the cutter.

## Errors

- `VideoGifError` (`errors.ts`): reading, staging, encoding or reading back the
  GIF failed. An OOM says "Try a shorter clip or a smaller size."
- `EngineNotLoadedError`: shared with the other video tools.

## Shared code

| File | Shared with |
| --- | --- |
| `src/hooks/use-clip-player.ts` | `/video-cutter`: object URL, rAF playhead, selection, filmstrip |
| `src/components/video-clip-stage.tsx` | `/video-cutter`: preview, controls, timeline |
| `src/components/video-trim-timeline.tsx` | `/video-cutter`; `maxSelection` was added for this tool |
| `src/hooks/use-object-url.ts` | the compressor's compare panel |

The run and cancel handlers, the side panel and the error class stay per tool.

## File reference

| File | Responsibility |
| --- | --- |
| `src/routes/video-to-gif.tsx` | Engine gate, file checks, make and cancel |
| `src/components/video-gif/gif-panel.tsx` | Settings, Make GIF, result card |
| `src/components/video-gif/state.ts` | Settings and job state |
| `src/lib/video/gif-options.ts` | Choices, defaults, `MAX_GIF_SECONDS`, `fitLongSide` (no `@ffmpeg/*`) |
| `src/lib/video/gif.ts` | `buildGifArgs`, `makeGif` (dynamic import only) |
| `src/lib/video/gif.test.ts` | Unit tests for the pure helpers |

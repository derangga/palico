# Audio Cutter

The Audio Cutter (`/audio-cutter`) trims a clip out of one audio file and shows
the file as a waveform, entirely in the browser. It accepts MP3, M4A, AAC, WAV,
OGG, Opus and FLAC. The cut runs on the same `ffmpeg.wasm` engine as the
[video cutter](./video-cutter.md) and copies the stream (`-c copy`), so the
output keeps the input's format and quality. The waveform uses only browser
APIs and needs no engine.

## Flow

1. The engine gate (`useEngineGate`, `VideoEnginePanel`) loads or offers the
   engine, as in the other ffmpeg tools. Someone who already downloaded it
   skips the dialog.
2. The user drops one audio file. The route checks the extension with
   `audioCutFormat` and the size with `checkCutterFileSize`.
3. `useClipPlayer` (with `filmstrip: false`) loads the file into a hidden
   `<audio>` element and owns the playhead and the selection. If the browser
   cannot play the file, the `<audio>` `error` event shows a toast and clears
   the file.
4. `useWaveform` decodes the file once the duration is known and gives
   `AudioClipStage` the peaks. `TrimTimeline` draws them behind the handles.
5. **Proceed** loads the engine if needed and calls `trimAudio` through a
   dynamic import. The result card shows the name and size and a Save button.
   Nothing downloads by itself.

## Why stream copy

An audio stream copy cuts on the codec's own frames (about 26 ms for MP3), so
unlike the video cutter there is no keyframe snapping to explain. The page says
a cut can land a few hundredths of a second from the selection. FLAC and Ogg
frames can be longer, so check that copy if a format feels coarse.

`trimAudio` reuses `buildTrimArgs` from `trim.ts` unchanged
(`-ss <start> -i <input> -t <duration> -c copy`). Nothing is decoded, so ffmpeg
reports no progress and the button shows a spinner. The output name is
`song-trimmed.mp3`.

The accepted formats live in `audio.ts` (`audioCutFormat`). The extension
decides, because browsers give an empty or odd MIME type for FLAC and Opus. The
list is separate from `AudioFormat` so the Extract Audio dropdown does not gain
FLAC and OGG.

## The waveform

`src/lib/video/waveform.ts` has no `@ffmpeg/*` import, so the page imports it
statically and draws the waveform before any engine loads. Like the filmstrip,
it is progressive enhancement: any failure means "no waveform", never "cannot
trim".

- `decodePeaks(file, maxBytes)` creates `new OfflineAudioContext(1, 1, 8000)`
  and calls `decodeAudioData`. An offline context needs no audio device and no
  user gesture. The 8 kHz rate keeps the resampled result small, but Chromium
  probably decodes at the file's own rate first (inference, not measured), so the
  caps assume 44.1 kHz stereo. If the browser rejects 8000 Hz, it retries at
  22050.
- `computePeaks` takes the largest absolute sample per bucket across channels
  and scales the loudest bucket to 1. 512 buckets are kept per file.
- `peaksToPath` max-pools those into one bar per 5 px and returns the `d` of a
  single `<path>`: one mirrored vertical segment per bar, never under 2 units
  tall, so silence still draws a dotted line.
- Caps: a file over 60 MB (25 MB on mobile) or longer than 15 minutes skips the
  waveform (about 320 MB decoded at 15 minutes). Both numbers are guesses to
  tune on a real phone.

`Waveform` (`src/components/waveform.tsx`) renders that path in `currentColor`
with `text-primary`. A Latte/Mocha swap needs no redraw. A `ResizeObserver`
rebuilds the path only when the width changes. The timeline's dimming overlays
wash out the bars outside the selection, so a drag changes two `left`/`width`
styles and re-renders nothing in the waveform.

## Design decisions

- Mauve (the primary, selection colour) for the bars. The Video & Audio accent
  stays on the page chip and the sidebar icon, so the component has one
  saturated colour.
- The only motion is a 200 ms `opacity` fade when the peaks replace the dotted
  placeholder. Handle drags, the playhead and keyboard nudges do not animate
  (`DESIGN.md` motion rules; see also `docs/video-cutter.md`, problem 1).
- The handles are 12 px wide but have a 44 px hit area (`before:` pseudo
  element), so a thumb can grab them. The video tools get the same change.
- Arrow keys nudge a handle by 0.1 s. Shift+Arrow and PageUp/PageDown move 1 s.
  Home and End jump to its limits.

## Shared code changed for this tool

- `useClipPlayer` is generic over the media element and takes `filmstrip`.
  `videoRef` is now `mediaRef`.
- `VideoTrimTimeline` became `TrimTimeline` (`trim-timeline.tsx`) with a
  `backdrop` slot and a `trackClassName`.
- `ClipControls` holds the time readout and buttons both stages use.
- `TrimPanel` takes `formatTitle` and `ResultIcon`.

## Errors

- `AudioTrimError`: an unsupported file, or reading, staging, copying or reading
  back failed. An OOM says the file is too large to trim in the browser.
- `EngineNotLoadedError`: shared with the other ffmpeg tools.
- `WaveformError`: decode failed or the file is over the cap. Non-fatal.

## Not covered

- Fades. They need a re-encode, which breaks the stream copy.
- Choosing an output format. Extract Audio converts formats.
- Several selections, splitting at a point, or zooming the waveform.
- Cutting audio out of a video. Extract Audio then Audio Cutter does that.

## File reference

| File | Responsibility |
| --- | --- |
| `src/routes/audio-cutter.tsx` | Engine gate, file checks, trim and cancel |
| `src/components/audio-clip-stage.tsx` | Hidden `<audio>`, controls, timeline with the waveform |
| `src/components/waveform.tsx` | SVG waveform |
| `src/components/trim-timeline.tsx` | Track, handles, playhead (shared with the video tools) |
| `src/components/clip-controls.tsx` | Time readout and play buttons (shared) |
| `src/hooks/use-waveform.ts` | Decode once the duration is known, skip long files |
| `src/hooks/use-clip-player.ts` | Playhead and selection (shared) |
| `src/lib/video/waveform.ts` | `decodePeaks`, `computePeaks`, `peaksToPath` (no `@ffmpeg/*`) |
| `src/lib/video/audio-trim.ts` | `trimAudio` (dynamic import only) |
| `src/lib/video/audio.ts` | `audioCutFormat` |
| `src/lib/video/errors.ts` | `AudioTrimError` |

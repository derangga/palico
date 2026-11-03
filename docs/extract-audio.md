# Extract Audio

The Extract Audio tool (`/extract-audio`) saves the first audio track of one
video as MP3, AAC (M4A), Opus or WAV, entirely in the browser. It runs on the
same `ffmpeg.wasm` engine as the [video converter](./video-converter.md) and the
[video cutter](./video-cutter.md). When the source codec already fits the
chosen container, the stream is copied instead of re-encoded.

## Flow

1. The engine gate (`useEngineGate`, `VideoEnginePanel`) loads or offers the
   engine. A user who already downloaded it in another video tool skips the
   dialog.
2. The user drops one video. `AudioPanel` shows the file and a format select
   (MP3 by default).
3. **Extract audio** loads the engine if needed and calls `extractAudio` from
   `src/lib/video/extract-audio.ts` through a dynamic import.
4. The job stages the file once, probes it with ffprobe, then copies or encodes.
5. The result card shows the name, the size and a Save button. Nothing
   downloads by itself. When the stream was copied, the toast says the original
   sound was kept as is.

## Formats and the copy rule

The table lives in `src/lib/video/audio.ts`, a pure module with no `@ffmpeg/*`
imports, so later audio tools can reuse it.

| Format | Ext | MIME | Copy when source codec is | Otherwise encode with |
| --- | --- | --- | --- | --- |
| MP3 | `mp3` | `audio/mpeg` | `mp3` | `-c:a libmp3lame -q:a 2` |
| AAC (M4A) | `m4a` | `audio/mp4` | `aac` | `-c:a aac -b:a 192k` |
| Opus | `opus` | `audio/ogg` | `opus` | `-c:a libopus -b:a 128k` |
| WAV | `wav` | `audio/wav` | `pcm_s16le` | `-c:a pcm_s16le` |

The stream is copied (`-c:a copy`) only when the first audio stream's
`codec_name` equals the format's copy codec. Each container takes that codec
from any source container. AAC from an MPEG-TS source needs `aac_adtstoasc`;
ffmpeg inserts it for the mp4 muxer by itself.

`buildAudioArgs` (unit tested in `audio.test.ts`) produces
`-i input.<ext> -map 0:a:0 <codec args> output.<ext>`. The explicit
`-map 0:a:0` picks the stream the probe looked at and leaves out video, cover
art and subtitles, so `-vn` is not needed.

When encoding to MP3 or Opus from a source with more than 2 channels, the args
add `-ac 2`. libmp3lame cannot write more than 2 channels, and libopus rejects
some 5.1 layouts. AAC and WAV keep the channel count.

## The probe

Before any encode, the job runs:

```
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,channels -of json input.<ext> -o probe.json
```

`parseAudioProbe` decodes `probe.json` with `Schema.parseJson`.

- No audio stream: `NoAudioTrackError`, "This video has no sound to extract."
  Nothing is encoded.
- A non-zero ffprobe exit or JSON that does not decode: `AudioExtractError`,
  "Could not read the audio in this video."
- A thrown ffprobe means the wasm instance died, so the engine is disposed, like
  a thrown exec.

`probe.json` is deleted on every exit path. The run, dispose and cleanup steps
live in `readProbeJson` (`probe.ts`), shared with Compress Video.

### How the probe fits the job runner

`runFfmpegJob` (`ffmpeg-job.ts`) accepts `args` as either an argv or a function
`(ffmpeg) => Effect<argv, E>`. A function runs after the input is staged and
inside the block that `Effect.ensuring(cleanup)` wraps, so the file is staged
once and a probe failure still deletes it. The converter, cutter and GIF tool
pass a plain argv and are unaffected. `EngineHandle` (`engine.ts`) exposes
`ffprobe` for this; the real `FFmpeg` instance has had it since 0.12.10.

## Limits and progress

Input files use the cutter caps (`checkCutterFileSize`: 1024 MB desktop, 500 MB
mobile). The video stream is never decoded, so memory is mostly the staged file
and its output.

A re-encode reports progress, and the button shows the percentage. A stream
copy reports none, so the button shows a spinner.

## Errors

- `NoAudioTrackError`: the video has no audio stream.
- `AudioExtractError`: reading, probing, encoding or reading back failed. An
  OOM says "Try a smaller file, or MP3 instead of WAV."
- `EngineNotLoadedError`: shared with the other video tools.

## Not covered

- Choosing among several audio tracks; the tool takes the first.
- A bitrate choice.
- A WAV size check. A two-hour video gives about 1.3 GB of WAV, which hits the
  OOM path.
- Telling the user before the run that the stream will be copied. That needs a
  probe at drop time and a second staging of the file.

## File reference

| File | Responsibility |
| --- | --- |
| `src/routes/extract-audio.tsx` | Engine gate, file checks, extract and cancel |
| `src/components/extract-audio/audio-panel.tsx` | Format select, buttons, result card |
| `src/components/extract-audio/state.ts` | File, format and job state |
| `src/lib/video/audio.ts` | Formats, presets, copy rule, `parseAudioProbe`, `buildAudioArgs` (no `@ffmpeg/*`) |
| `src/lib/video/extract-audio.ts` | Probe and `extractAudio` (dynamic import only) |
| `src/lib/video/audio.test.ts` | Unit tests for the pure helpers |
| `src/lib/video/ffmpeg-job.ts` | `args` may be a function run after staging |
| `src/lib/video/engine.ts` | `ffprobe` on `EngineHandle` |

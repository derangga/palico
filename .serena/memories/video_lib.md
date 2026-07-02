# Video Library (`src/lib/video/`)

## Modules

| File | Purpose |
|---|---|
| `engine.ts` | ffmpeg.wasm engine lifecycle: `loadEngine`/`getEngine`/`disposeEngine`, asset caching (`openCache`/`peekCache`/`putInCache` via Cache API), blob URL tracking |
| `converter.ts` | `convertVideos` Effect; `ConvertVideoInput`/`ConvertVideoOutput`; progress via `VideoProgressUpdate` (`ProgressProcessing`/`ProgressDone`/`ProgressError`) |
| `trim.ts` | Video cutter/trim logic |
| `thumbnails.ts` | Frame/thumbnail extraction |
| `ffmpeg-job.ts` | Job orchestration around ffmpeg.wasm calls |
| `limits.ts` | Size/duration limits |
| `cache.ts` | Cache API wrapper for ffmpeg core/wasm assets (avoid re-downloading) |
| `preferences.ts` | User preference persistence (e.g. last-used format) |
| `errors.ts` | Tagged error classes |

## Invariants

- Uses `@ffmpeg/ffmpeg` (ffmpeg.wasm) — requires cross-origin isolation (COOP/COEP), set in `src/server.ts`.
- Engine is a module-level singleton (`engineRef`), loaded lazily and reused across conversions.
- See bd memories `video-converter-pipeline` and `video-ffmpeg-engine-load` for pipeline-specific Effect patterns.

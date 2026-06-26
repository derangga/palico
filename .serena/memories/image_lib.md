# Image Library (`src/lib/image/`)

## Modules

| File | Purpose |
|---|---|
| `types.ts` | Effect Schema types: `OutputFormat`, `WorkerRequest`, `WorkerResponse`, `formatMeta`, `sourceFormatMeta`, limits (`MAX_FILES`, `MAX_FILE_BYTES`, `MAX_DIMENSION`) |
| `errors.ts` | Tagged error classes: `DecodeError`, `EncodeError`, `DimensionsTooLargeError`, `FileTooLargeError`, `ModelLoadError`, `InferenceError`, `WorkerError`, `ZipError`; union aliases `BackgroundRemovalError`, `ConvertError`, `FaviconError` |
| `converter.ts` | `ConvertInput`/`ConvertOutput`/`ProgressUpdate` schemas; `convertImages` Effect; delegates to Web Worker |
| `resizer.ts` | Resizer logic; native canvas APIs, no WASM |
| `background-removal.ts` | `removeBackground` Effect; `@huggingface/transformers` RMBG-1.4 on main thread; pipeline cached at module level; `env.useBrowserCache=false` (iOS Safari fix) |
| `favicon.ts` | Multi-size favicon generation |
| `worker-client.ts` | `runImageWorker` + `workerUrl`; bridge between routes and the Web Worker |
| `zip.ts` | fflate-based zip helper |

## WASM / Threading

- Only background removal uses WASM (via @huggingface/transformers → ONNX Runtime), with WebGPU primary + WASM fallback.
- Converter/resizer/favicon use native browser APIs only — no WASM.
- "On-Device" or "In-Browser" is the correct cross-tool claim; "WASM Powered" is not universal.

## Worker

`src/workers/image-converter.worker.ts` — handles converter via OffscreenCanvas. Spawned via `workerUrl` import in `worker-client.ts`.

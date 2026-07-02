# File Library (`src/lib/file/`)

## Modules

| File | Purpose |
|---|---|
| `pdf.ts` | `mergePdfs`, `splitPdf`, `extractPages`, `loadPdf` — pdf-lib based, no WASM |
| `pdf-types.ts` | Schema types for PDF ops |
| `pdf-worker-client.ts` | Bridge to `src/workers/pdf.worker.ts` |
| `office-engine.ts` | LibreOffice WASM engine (Zeta helper) lifecycle: `bootEngine`/`loadEngine`/`isEngineReady`, `convertToPdf`; asset caching via Cache API |
| `office.ts` | `validateFile`/`validateBatch` + orchestration for Word→PDF conversion; zips multi-file output via `fflate` |
| `office-limits.ts` | Per-file and batch size/format checks (`checkOfficeFile`, `checkOfficeBatch`) |
| `office-types.ts` | Limits (`MAX_BATCH_BYTES`, `MAX_BATCH_FILES`, `MB`) + schema types |
| `diff.ts` | File diff logic for the diff-viewer route |
| `errors.ts` | Tagged error classes (`OfficeConvertError`, `OfficeTooLargeError`, `OfficeUnsupportedFormatError`, `OfficeBatchTooLargeError`, `OfficeZipError`, etc.) |

## Invariants

- Office-to-PDF uses LibreOffice compiled to WASM (Zeta helper, `OFFICE_THREAD_URL`/`ZETA_HELPER_URL`) — requires cross-origin isolation like video.
- PDF merge/split uses pdf-lib directly — no WASM, runs via `pdf.worker.ts`.
- Supported Office formats: `.docx`, `.doc`, `.odt`, `.rtf`.
- See bd memory `pdf-tool-conventions` for PDF-tool-specific notes.

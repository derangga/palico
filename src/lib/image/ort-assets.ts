// Same-origin URLs for the ONNX Runtime files that background removal needs.
//
// transformers.js points ORT at cdn.jsdelivr.net when `wasmPaths` is unset, which
// breaks offline. The 21 MB wasm already ships in dist/client/assets (hashed) and
// the .mjs is tiny, so we serve both ourselves. `?url` yields the hashed URL
// without loading the file. onnxruntime-web's `exports` map hides dist/*, hence
// the relative node_modules path.
import ortMjsUrl from "../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url";
import ortWasmUrl from "../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url";

export const ORT_ASSET_URLS = { mjs: ortMjsUrl, wasm: ortWasmUrl } as const;

// Cache API bucket names shared between the page and the service worker. Kept
// dependency-free so the worker bundle does not pull in Effect.

// ONNX Runtime .mjs + .wasm for background removal. The page fills it on the
// consented model download; the service worker serves from it offline.
export const ORT_CACHE_NAME = "palico-ort-v1";

// Cache API bucket names shared between the page and the service worker. Kept
// dependency-free so the worker bundle does not pull in Effect.

// ONNX Runtime .mjs + .wasm for background removal. The page fills it on the
// consented model download; the service worker serves from it offline.
export const ORT_CACHE_NAME = "palico-ort-v1";

// qpdf compiled to WebAssembly (@neslinesli93/qpdf-wasm), used by the PDF password
// tool. The page stores the self-hosted wasm here on the consent download and the
// job worker reads it from here. Bump with the package version in package.json: a
// Vitest test fails when the two drift.
export const QPDF_VERSION = "0.3.1";

export const QPDF_CACHE_NAME = `palico-qpdf-v${QPDF_VERSION}`;

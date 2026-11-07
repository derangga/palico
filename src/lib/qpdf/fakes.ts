// Test helpers for running the real qpdf wasm in node. Not imported by app code.
//
// In node the glue reads the wasm from a file path (it is built to), so a test locates
// the wasm by its path in node_modules instead of by a blob URL. Everything else is
// the shipped build.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { QpdfHooks } from "./run.ts";

export const WASM_PATH = resolve(
	"node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm",
);

const file = readFileSync(WASM_PATH);

// The wasm as an ArrayBuffer, the form the runner takes.
export const wasmBytes: ArrayBuffer = file.buffer.slice(
	file.byteOffset,
	file.byteOffset + file.byteLength,
);

export const nodeHooks: QpdfHooks = {
	locate: () => ({ url: WASM_PATH, release: () => undefined }),
};

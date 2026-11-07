// Runs qpdf inside a worker. This is the reusable core of the engine: give it
// input files, one or more qpdf command lines and the output paths to read back, and
// it returns each command's exit code and text. Tools build their own command lines
// (see src/lib/pdf-password/args.ts) and read the text to decide what went wrong.
//
// Only worker code imports this (src/workers/pdf-crypt.worker.ts). The qpdf glue
// code is large, so it must stay out of the page bundle.

import createModule from "@neslinesli93/qpdf-wasm";

import { QPDF_CACHE_NAME } from "#/lib/offline/cache-names.ts";

import {
	QPDF_OK_EXITS,
	type QpdfInput,
	type QpdfOutput,
	type QpdfRunResult,
	type QpdfStep,
	type QpdfStepResult,
} from "./types.ts";

// The part of the Emscripten module we use. The package's own typings leave out
// `FS.writeFile`, `unlink` and the module options.
interface QpdfModule {
	readonly callMain: (args: string[]) => number;
	readonly FS: {
		readonly writeFile: (path: string, data: Uint8Array) => void;
		readonly readFile: (path: string) => Uint8Array;
	};
}

// The Emscripten factory takes a `locateFile` option. It does not take `wasmBinary`
// in this build: the glue always fetches the file `locateFile` names, and with no
// `locateFile` it fetches `qpdf.wasm` next to the worker script, which is not where
// the bundler puts it. So the bytes we already hold are handed over as a blob URL.
type CreateModule = (options: {
	locateFile: (name: string) => string;
}) => Promise<QpdfModule>;

// SAFETY: createModule is the Emscripten factory. Its published typings declare only
// `locateFile`, and not as taking the file name, but that is how it is called.
// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the types do not overlap, so TypeScript needs the hop through unknown.
const create = createModule as unknown as CreateModule;

// The wasm bytes, cache first. The page stored them on the consented download, and
// the Cache API is readable here without the service worker, so this also works on
// a first visit or a hard reload. A cache miss falls back to the network.
export const loadQpdfWasm = async (url: string): Promise<ArrayBuffer> => {
	if (typeof caches !== "undefined") {
		const hit = await caches
			.open(QPDF_CACHE_NAME)
			.then((cache) => cache.match(url))
			.catch(() => undefined);

		if (hit) return hit.arrayBuffer();
	}

	const res = await fetch(url);

	if (!res.ok) throw new Error(`qpdf.wasm returned ${res.status}`);

	return res.arrayBuffer();
};

// Where the glue should read the wasm from, and how to let go of it.
export interface WasmLocation {
	readonly url: string;
	readonly release: () => void;
}

export type LocateWasm = (wasm: ArrayBuffer) => WasmLocation;

// The default: a blob URL over the bytes we hold, so nothing is fetched from a path.
export const locateWasmAsBlob: LocateWasm = (wasm) => {
	const url = URL.createObjectURL(
		new Blob([wasm], { type: "application/wasm" }),
	);

	return { url, release: () => URL.revokeObjectURL(url) };
};

// Seams for tests. A test passes the glue it loaded in a fake worker, or a locator
// that suits node (where the glue reads files, not URLs).
export interface QpdfHooks {
	readonly create?: CreateModule;
	readonly locate?: LocateWasm;
}

// The wasm was found but would not start (a damaged download, or a browser without
// WebAssembly). The worker reports it as an engine failure, not a bad PDF. The
// message carries what the glue itself said while it failed, which is the part that
// explains why.
export class QpdfStartError extends Error {}

interface Sink {
	out: string[];
	err: string[];
}

// The sink the capturing console functions write to; replaced before each command.
interface SinkRef {
	current: Sink;
}

const startFailure = (cause: unknown, said: ReadonlyArray<string>): string =>
	[cause instanceof Error ? cause.message : String(cause), ...said]
		.filter((part) => part !== "")
		.join("; ");

// This build of the glue code ignores the `print` and `printErr` options and writes
// to `console.log` and `console.error`, bound when the module starts. So the two
// are swapped for capturing functions while it starts, and the sink they write to is
// replaced before each command. Anything else that logs while it starts is kept in
// the sink too, and goes into the error if the start fails. The worker runs one job,
// so two starts never overlap and the swap never nests.
const instantiate = async (
	wasm: ArrayBuffer,
	sink: SinkRef,
	hooks: QpdfHooks,
): Promise<QpdfModule> => {
	const log = console.log;
	const error = console.error;
	const where = (hooks.locate ?? locateWasmAsBlob)(wasm);

	console.log = (...parts: unknown[]) => {
		sink.current.out.push(parts.join(" "));
	};

	console.error = (...parts: unknown[]) => {
		sink.current.err.push(parts.join(" "));
	};

	try {
		return await (hooks.create ?? create)({ locateFile: () => where.url });
	} catch (cause) {
		throw new QpdfStartError(startFailure(cause, sink.current.err));
	} finally {
		console.log = log;
		console.error = error;
		where.release();
	}
};

export const runQpdf = async (params: {
	readonly wasm: ArrayBuffer;
	readonly inputs: ReadonlyArray<QpdfInput>;
	readonly steps: ReadonlyArray<QpdfStep>;
	readonly outputs: ReadonlyArray<string>;
	readonly hooks?: QpdfHooks;
}): Promise<QpdfRunResult> => {
	const sink: SinkRef = { current: { out: [], err: [] } };
	const qpdf = await instantiate(params.wasm, sink, params.hooks ?? {});

	for (const input of params.inputs) qpdf.FS.writeFile(input.path, input.bytes);

	const steps: QpdfStepResult[] = [];

	for (const step of params.steps) {
		sink.current = { out: [], err: [] };
		let exitCode: number;

		try {
			exitCode = qpdf.callMain([...step.args]);
		} catch (cause) {
			// An exception out of callMain is a crash inside qpdf, not an exit code.
			sink.current.err.push(cause instanceof Error ? cause.message : "crashed");
			exitCode = 2;
		}

		steps.push({
			exitCode,
			stdout: sink.current.out,
			stderr: sink.current.err,
		});

		if (!QPDF_OK_EXITS.includes(exitCode)) break;
	}

	const outputs: QpdfOutput[] = [];

	for (const path of params.outputs) {
		// This build exposes only a few FS calls, so "does not exist" is a throw.
		const read = (() => {
			try {
				return qpdf.FS.readFile(path);
			} catch {
				return undefined;
			}
		})();

		// Copy into a buffer of exactly this size, so it can be transferred whole.
		if (read) outputs.push({ path, bytes: new Uint8Array(read) });
	}

	return { steps, outputs };
};

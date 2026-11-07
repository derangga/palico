import { Schema } from "effect";

// The generic message pair for running qpdf commands in src/workers/pdf-crypt.worker.ts.
// A tool that only needs qpdf's output (a lossless compression pass, a repair) sends a
// `qpdf-run` and builds its own command lines. The PDF password tool has its own,
// higher-level message in src/lib/pdf-password/protocol.ts that shares the worker.
//
// Schema-first like src/lib/file/pdf-types.ts: each shape is a Schema and its TS type
// is derived from it.

const BinaryFile = Schema.Struct({
	path: Schema.String,
	bytes: Schema.instanceOf(ArrayBuffer),
});

export const QpdfRunRequest = Schema.Struct({
	type: Schema.Literal("qpdf-run"),
	id: Schema.String,
	// Where the engine's wasm is (QPDF_WASM_URL). The worker reads the Cache API
	// first and falls back to this URL.
	wasmUrl: Schema.String,
	inputs: Schema.Array(BinaryFile),
	steps: Schema.Array(Schema.Struct({ args: Schema.Array(Schema.String) })),
	outputs: Schema.Array(Schema.String),
});

export type QpdfRunRequest = Schema.Schema.Type<typeof QpdfRunRequest>;

export const QpdfRunDone = Schema.Struct({
	type: Schema.Literal("qpdf-run-done"),
	id: Schema.String,
	steps: Schema.Array(
		Schema.Struct({
			exitCode: Schema.Number,
			stdout: Schema.Array(Schema.String),
			stderr: Schema.Array(Schema.String),
		}),
	),
	outputs: Schema.Array(BinaryFile),
});

export type QpdfRunDone = Schema.Schema.Type<typeof QpdfRunDone>;

export const QpdfFailReason = Schema.Literals(["engine-load", "worker"]);

export type QpdfFailReason = Schema.Schema.Type<typeof QpdfFailReason>;

// Any job can fail with this; the worker posts it instead of a result.
export const QpdfFailure = Schema.Struct({
	type: Schema.Literal("error"),
	id: Schema.String,
	reason: QpdfFailReason,
	detail: Schema.optional(Schema.String),
});

export type QpdfFailure = Schema.Schema.Type<typeof QpdfFailure>;

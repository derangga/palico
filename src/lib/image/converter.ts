import { Effect, Result, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import {
	DecodeError,
	DimensionsTooLargeError,
	EncodeError,
	FileTooLargeError,
	WorkerError,
} from "./errors.ts";
import {
	DEFAULT_QUALITY,
	formatMeta,
	MAX_FILE_BYTES,
	OutputFormat,
} from "./types.ts";
import { runImageWorker } from "./worker-client.ts";

export const ConvertInput = Schema.Struct({
	id: Schema.String,
	file: Schema.instanceOf(File),
	format: OutputFormat,
});

export type ConvertInput = Schema.Schema.Type<typeof ConvertInput>;

export const ConvertOutput = Schema.Struct({
	id: Schema.String,
	blob: Schema.instanceOf(Blob),
	width: Schema.Number,
	height: Schema.Number,
	size: Schema.Number,
});

export type ConvertOutput = Schema.Schema.Type<typeof ConvertOutput>;

export const ProgressUpdate = Schema.Union([
	Schema.Struct({
		id: Schema.String,
		status: Schema.Literal("processing"),
	}),
	Schema.Struct({
		id: Schema.String,
		status: Schema.Literal("done"),
		output: ConvertOutput,
	}),
	Schema.Struct({
		id: Schema.String,
		status: Schema.Literal("error"),
		error: Schema.Union([
			FileTooLargeError,
			DimensionsTooLargeError,
			DecodeError,
			EncodeError,
			WorkerError,
		]),
	}),
]);

export type ProgressUpdate = Schema.Schema.Type<typeof ProgressUpdate>;

export const validateSize = (
	file: File,
): Effect.Effect<void, FileTooLargeError> =>
	file.size > MAX_FILE_BYTES
		? Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: m.error_file_too_large({
						name: file.name,
						limit: Math.round(MAX_FILE_BYTES / (1024 * 1024)),
					}),
				}),
			)
		: Effect.void;

const convertOne = Effect.fn("ImageConverter.convertOne")(function* (
	input: ConvertInput,
) {
	yield* validateSize(input.file);
	const meta = formatMeta(input.format);

	const buffer = yield* Effect.tryPromise({
		try: () => input.file.arrayBuffer(),
		catch: (err) =>
			new DecodeError({
				fileName: input.file.name,
				message: err instanceof Error ? err.message : m.error_read_file(),
			}),
	});

	return yield* runImageWorker({
		id: input.id,
		fileName: input.file.name,
		buffer,
		sourceType: input.file.type,
		format: input.format,
		mime: meta.mime,
		quality: DEFAULT_QUALITY,
	});
});

// Convert a batch with bounded concurrency. Per-file failures are captured as
// Result so one bad image never aborts the rest; the UI is notified per file via
// onProgress, and only successful outputs are returned (for zipping).
export const convertImages = (
	inputs: ReadonlyArray<ConvertInput>,
	onProgress: (update: ProgressUpdate) => void,
): Effect.Effect<ReadonlyArray<ConvertOutput>, never> =>
	Effect.forEach(
		inputs,
		(input) =>
			Effect.gen(function* () {
				yield* Effect.sync(() =>
					onProgress({ id: input.id, status: "processing" }),
				);
				const result = yield* Effect.result(convertOne(input));
				yield* Effect.sync(() =>
					Result.isSuccess(result)
						? onProgress({
								id: input.id,
								status: "done",
								output: result.success,
							})
						: onProgress({
								id: input.id,
								status: "error",
								error: result.failure,
							}),
				);

				return result;
			}),
		{ concurrency: 5 },
	).pipe(
		Effect.map((results) =>
			results.flatMap((r) => (Result.isSuccess(r) ? [r.success] : [])),
		),
	);

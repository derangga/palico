import { Effect, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import { type ConvertError, DecodeError, FileTooLargeError } from "./errors.ts";
import { DEFAULT_QUALITY, MAX_FILE_BYTES, sourceFormatMeta } from "./types.ts";
import { runImageWorker, type WorkerOutput } from "./worker-client.ts";

export const ResizeInput = Schema.Struct({
	id: Schema.String,
	file: Schema.instanceOf(File),
	targetWidth: Schema.Number,
	targetHeight: Schema.Number,
});

export type ResizeInput = Schema.Schema.Type<typeof ResizeInput>;

export type ResizeOutput = WorkerOutput;

const validateSize = (file: File): Effect.Effect<void, FileTooLargeError> =>
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

// Resize a single image, keeping its source format. Reuses the shared worker
// pipeline (decode → validate dimensions → scaled draw → encode); only the
// resize target is added compared to the converter.
export const resizeImage = (
	input: ResizeInput,
): Effect.Effect<ResizeOutput, ConvertError> =>
	Effect.gen(function* () {
		yield* validateSize(input.file);
		const meta = sourceFormatMeta(input.file.type);

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
			format: meta.value,
			mime: meta.mime,
			quality: DEFAULT_QUALITY,
			targetWidth: input.targetWidth,
			targetHeight: input.targetHeight,
		});
	});

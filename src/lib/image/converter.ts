import { Effect, Either } from "effect";

import { type ConvertError, DecodeError, FileTooLargeError } from "./errors.ts";
import {
	DEFAULT_QUALITY,
	formatMeta,
	MAX_FILE_BYTES,
	type OutputFormat,
} from "./types.ts";
import { runImageWorker } from "./worker-client.ts";

export interface ConvertInput {
	readonly id: string;
	readonly file: File;
	readonly format: OutputFormat;
}

export interface ConvertOutput {
	readonly id: string;
	readonly blob: Blob;
	readonly width: number;
	readonly height: number;
	readonly size: number;
}

export interface ProgressUpdate {
	readonly id: string;
	readonly status: "processing" | "done" | "error";
	readonly output?: ConvertOutput;
	readonly error?: ConvertError;
}

const validateSize = (file: File): Effect.Effect<void, FileTooLargeError> =>
	file.size > MAX_FILE_BYTES
		? Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(
						MAX_FILE_BYTES / (1024 * 1024),
					)} MB limit.`,
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
				message: err instanceof Error ? err.message : "Could not read file.",
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
// Either so one bad image never aborts the rest; the UI is notified per file via
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
				const result = yield* Effect.either(convertOne(input));
				yield* Effect.sync(() =>
					Either.isRight(result)
						? onProgress({
								id: input.id,
								status: "done",
								output: result.right,
							})
						: onProgress({
								id: input.id,
								status: "error",
								error: result.left,
							}),
				);
				return result;
			}),
		{ concurrency: 5 },
	).pipe(
		Effect.map((results) =>
			results.flatMap((r) => (Either.isRight(r) ? [r.right] : [])),
		),
	);

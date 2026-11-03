import { Effect, Either, Schema } from "effect";

import { validateSize } from "./converter.ts";
import { type ConvertError, DecodeError } from "./errors.ts";
import { formatMeta, type OutputFormat, outputFileName } from "./types.ts";
import { runImageWorker } from "./worker-client.ts";

// "same" keeps JPEG and WebP. PNG and anything else becomes WebP: canvas
// ignores `quality` for PNG, and WebP keeps transparency.
export const CompressFormat = Schema.Literal("same", "jpeg", "webp");
export type CompressFormat = Schema.Schema.Type<typeof CompressFormat>;

export const CompressInput = Schema.Struct({
	id: Schema.String,
	file: Schema.instanceOf(File),
	format: CompressFormat,
	quality: Schema.Number, // 0..1, the ceiling when targetBytes is set
	targetBytes: Schema.optional(Schema.Number),
});
export type CompressInput = Schema.Schema.Type<typeof CompressInput>;

export const CompressOutput = Schema.Struct({
	id: Schema.String,
	blob: Schema.instanceOf(Blob),
	fileName: Schema.String,
	formatLabel: Schema.String,
	size: Schema.Number,
	originalSize: Schema.Number,
	quality: Schema.Number,
	// false when even the lowest quality is over targetBytes.
	targetMet: Schema.Boolean,
	// true when re-encoding did not make the file smaller.
	keptOriginal: Schema.Boolean,
});
export type CompressOutput = Schema.Schema.Type<typeof CompressOutput>;

export type CompressProgress =
	| { id: string; status: "processing" }
	| { id: string; status: "done"; output: CompressOutput }
	| { id: string; status: "error"; error: ConvertError };

export const targetFormat = (
	format: CompressFormat,
	sourceMime: string,
): OutputFormat =>
	format !== "same" ? format : sourceMime === "image/jpeg" ? "jpeg" : "webp";

const compressOne = Effect.fn("ImageCompressor.compressOne")(function* (
	input: CompressInput,
) {
	const { file } = input;
	yield* validateSize(file);
	const format = targetFormat(input.format, file.type);
	const meta = formatMeta(format);
	const buffer = yield* Effect.tryPromise({
		try: () => file.arrayBuffer(),
		catch: (err) =>
			new DecodeError({
				fileName: file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});
	const out = yield* runImageWorker({
		id: input.id,
		fileName: file.name,
		buffer,
		sourceType: file.type,
		format,
		mime: meta.mime,
		quality: input.quality,
		targetBytes: input.targetBytes,
		fillWhite: format === "jpeg",
	});

	// Never hand back a bigger file than the user gave us.
	const keptOriginal = out.size >= file.size;
	return {
		id: input.id,
		blob: keptOriginal ? file : out.blob,
		fileName: keptOriginal ? file.name : outputFileName(file.name, meta.ext),
		formatLabel: keptOriginal ? "original" : meta.label,
		size: keptOriginal ? file.size : out.size,
		originalSize: file.size,
		quality: out.quality,
		targetMet: keptOriginal
			? input.targetBytes == null || file.size <= input.targetBytes
			: out.targetMet,
		keptOriginal,
	} satisfies CompressOutput;
});

// Same shape as convertImages: bounded concurrency, per-file Either so one bad
// image never aborts the rest, progress reported per file.
export const compressImages = (
	inputs: ReadonlyArray<CompressInput>,
	onProgress: (update: CompressProgress) => void,
): Effect.Effect<ReadonlyArray<CompressOutput>, never> =>
	Effect.forEach(
		inputs,
		(input) =>
			Effect.gen(function* () {
				yield* Effect.sync(() =>
					onProgress({ id: input.id, status: "processing" }),
				);
				const result = yield* Effect.either(compressOne(input));
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

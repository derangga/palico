import { Effect, type Result } from "effect";

import { type PdfLoadError, PdfTooLargeError } from "#/lib/file/errors.ts";
import { MAX_PDF_BYTES } from "#/lib/file/pdf-types.ts";
import {
	readPdfMetadataInWorker,
	stripPdfMetadataInWorker,
} from "#/lib/file/pdf-worker-client.ts";
import { FileTooLargeError } from "#/lib/image/errors.ts";
import { MAX_FILE_BYTES } from "#/lib/image/types.ts";

import {
	MetadataParseError,
	MetadataStillPresentError,
	UnsupportedFormatError,
} from "./errors.ts";
import { readImageMetadata } from "./image-read.ts";
import { stripImageMetadata } from "./image-strip.ts";
import { IMAGE_MIME_TYPES, type MetadataReport } from "./types.ts";

// Orchestration for the Remove Metadata tool. Images are read and stripped on
// the main thread (header-only work, nothing is decoded); PDFs go through the
// PDF worker. Every strip is followed by a re-read of the output.

export type MetadataError =
	| UnsupportedFormatError
	| MetadataParseError
	| MetadataStillPresentError
	| FileTooLargeError
	| PdfTooLargeError
	| PdfLoadError;

export interface FileInput {
	readonly id: string;
	readonly file: File;
}

export interface StripResult {
	readonly blob: Blob;
	readonly after: MetadataReport;
}

const MB = 1024 * 1024;

const isPdf = (file: File) =>
	file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const checkFile = (
	file: File,
): Effect.Effect<
	"image" | "pdf",
	UnsupportedFormatError | FileTooLargeError | PdfTooLargeError
> => {
	if (isPdf(file)) {
		return file.size > MAX_PDF_BYTES
			? Effect.fail(
					new PdfTooLargeError({
						fileName: file.name,
						size: file.size,
						limit: MAX_PDF_BYTES,
						message: `"${file.name}" is larger than the ${MAX_PDF_BYTES / MB} MB limit.`,
					}),
				)
			: Effect.succeed("pdf");
	}

	if (!IMAGE_MIME_TYPES.includes(file.type)) {
		return Effect.fail(
			new UnsupportedFormatError({
				fileName: file.name,
				mime: file.type || "unknown",
				message: `"${file.name}" is not a JPEG, PNG, WebP or PDF file.`,
			}),
		);
	}

	return file.size > MAX_FILE_BYTES
		? Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${MAX_FILE_BYTES / MB} MB limit.`,
				}),
			)
		: Effect.succeed("image");
};

const readBytes = (file: File) =>
	Effect.tryPromise({
		try: () => file.arrayBuffer(),
		catch: (err) =>
			new MetadataParseError({
				fileName: file.name,
				message: err instanceof Error ? err.message : "Could not read file.",
			}),
	});

export const inspectFile = Effect.fn("Metadata.inspectFile")(function* (
	input: FileInput,
) {
	const { id, file } = input;
	const kind = yield* checkFile(file);
	const buffer = yield* readBytes(file);

	return kind === "pdf"
		? yield* readPdfMetadataInWorker({ id, fileName: file.name, buffer })
		: yield* readImageMetadata(file.name, new Uint8Array(buffer));
});

export const stripFile = Effect.fn("Metadata.stripFile")(function* (
	input: FileInput,
) {
	const { id, file } = input;
	const kind = yield* checkFile(file);
	const buffer = yield* readBytes(file);

	let bytes: BlobPart;
	let after: MetadataReport;

	if (kind === "pdf") {
		const result = yield* stripPdfMetadataInWorker({
			id,
			fileName: file.name,
			buffer,
		});

		bytes = result.bytes;
		after = result.after;
	} else {
		const out = yield* stripImageMetadata(file.name, new Uint8Array(buffer));
		after = yield* readImageMetadata(file.name, out);
		bytes = out;
	}

	if (after.fields.length > 0) {
		return yield* new MetadataStillPresentError({
			fileName: file.name,
			fields: after.fields.map((f) => f.label),
			message: `Some data could not be removed: ${after.fields
				.map((f) => f.label)
				.join(", ")}.`,
		});
	}

	return {
		blob: new Blob([bytes], {
			type: kind === "pdf" ? "application/pdf" : file.type,
		}),
		after,
	} satisfies StripResult;
});

// Run `task` over a batch with bounded concurrency. Each file's outcome is
// reported as a Result so one bad file never stops the rest. Kept at 3 since
// every PDF spins up its own worker holding up to 50 MB.
export const forEachFile = <A, E>(
	inputs: ReadonlyArray<FileInput>,
	task: (input: FileInput) => Effect.Effect<A, E>,
	onResult: (id: string, result: Result.Result<A, E>) => void,
): Effect.Effect<void> =>
	Effect.forEach(
		inputs,
		(input) =>
			task(input).pipe(
				Effect.result,
				Effect.flatMap((result) =>
					Effect.sync(() => onResult(input.id, result)),
				),
			),
		{ concurrency: 3, discard: true },
	);

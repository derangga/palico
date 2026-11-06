import { Effect } from "effect";
import { zip } from "fflate";

import { m } from "#/paraglide/messages.js";

import {
	OfficeBatchTooLargeError,
	OfficeConvertError,
	OfficeTooLargeError,
	OfficeUnsupportedFormatError,
	OfficeZipError,
} from "./errors.ts";
import { convertToPdf } from "./office-engine.ts";
import { checkOfficeBatch, checkOfficeFile } from "./office-limits.ts";
import { MAX_BATCH_BYTES, MAX_BATCH_FILES, MB } from "./office-types.ts";

// Validate one file against the supported-format + per-file size caps, mapping
// the pure check result onto typed errors. Returns the resolved extension.
const validateFile = (
	file: File,
): Effect.Effect<
	string,
	OfficeUnsupportedFormatError | OfficeTooLargeError
> => {
	const check = checkOfficeFile({ name: file.name, size: file.size });

	switch (check.kind) {
		case "ok":
			return Effect.succeed(check.ext);
		case "unsupported":
			return Effect.fail(
				new OfficeUnsupportedFormatError({
					fileName: file.name,
					message: m.error_office_unsupported({ name: file.name }),
				}),
			);
		case "too-large":
			return Effect.fail(
				new OfficeTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: check.limitBytes,
					message: m.error_office_too_large({
						name: file.name,
						limit: Math.round(check.limitBytes / MB),
					}),
				}),
			);
	}
};

// Validate the batch as a whole (count + combined size).
export const validateBatch = (
	files: ReadonlyArray<File>,
): Effect.Effect<void, OfficeBatchTooLargeError> => {
	const check = checkOfficeBatch(files);

	if (check.kind === "ok") return Effect.void;
	const total = files.reduce((sum, f) => sum + f.size, 0);

	const message =
		check.kind === "too-many"
			? m.error_office_too_many({ limit: check.limit })
			: m.error_office_batch_too_large({
					limit: Math.round(check.limitBytes / MB),
				});

	return Effect.fail(
		new OfficeBatchTooLargeError({
			count: files.length,
			totalSize: total,
			fileLimit: MAX_BATCH_FILES,
			byteLimit: MAX_BATCH_BYTES,
			message,
		}),
	);
};

const readBytes = (file: File): Effect.Effect<Uint8Array, OfficeConvertError> =>
	Effect.tryPromise({
		try: async () => new Uint8Array(await file.arrayBuffer()),
		catch: (cause) =>
			new OfficeConvertError({
				fileName: file.name,
				message: cause instanceof Error ? cause.message : m.error_read_file(),
			}),
	});

// Convert a single validated file to a PDF Blob (used for the one-file path,
// which downloads the PDF directly rather than a zip).
export const convertFileToPdf = Effect.fn("Office.convertFileToPdf")(
	function* (params: { readonly id: string; readonly file: File }) {
		const ext = yield* validateFile(params.file);
		const bytes = yield* readBytes(params.file);

		const pdf = yield* convertToPdf({
			id: params.id,
			fileName: params.file.name,
			ext,
			bytes,
		});

		return new Blob([pdf], { type: "application/pdf" });
	},
);

// Make zip entry names unique (two "report.pdf" outputs → report.pdf,
// report-1.pdf), mirroring the image converter's zip behavior.
const uniqueNames = (names: ReadonlyArray<string>): string[] => {
	const seen = new Map<string, number>();

	return names.map((name) => {
		const count = seen.get(name) ?? 0;
		seen.set(name, count + 1);

		if (count === 0) return name;
		const dot = name.lastIndexOf(".");

		return dot === -1
			? `${name}-${count}`
			: `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
	});
};

// Bundle already-converted PDFs into a single zip. PDFs barely compress, so we
// store (level 0) — fast and lossless. Called on demand from the "Download all"
// action once the user has converted, so it works off in-memory blobs rather
// than re-running conversion.
export const zipPdfs = (
	entries: ReadonlyArray<{ readonly name: string; readonly blob: Blob }>,
): Effect.Effect<Blob, OfficeZipError> =>
	Effect.gen(function* () {
		const names = uniqueNames(entries.map((e) => e.name));
		const files: Record<string, Uint8Array> = {};

		for (let i = 0; i < entries.length; i++) {
			const buffer = yield* Effect.tryPromise({
				try: () => entries[i].blob.arrayBuffer(),
				catch: (cause) =>
					new OfficeZipError({
						message:
							cause instanceof Error
								? cause.message
								: m.error_office_read_pdf(),
					}),
			});

			files[names[i]] = new Uint8Array(buffer);
		}

		return yield* Effect.callback<Blob, OfficeZipError>((resume) => {
			zip(files, { level: 0 }, (err, data) => {
				if (err) {
					resume(Effect.fail(new OfficeZipError({ message: err.message })));
				} else {
					// SAFETY: fflate allocates the zip output itself with new Uint8Array, so
					// it is backed by a plain ArrayBuffer, never a SharedArrayBuffer.
					const bytes = data as Uint8Array<ArrayBuffer>;
					resume(
						Effect.succeed(new Blob([bytes], { type: "application/zip" })),
					);
				}
			});
		});
	});

import {
	type FileContents,
	type FileDiffMetadata,
	parseDiffFromFile,
} from "@pierre/diffs";
import { Effect, Schema } from "effect";

import {
	type DiffError,
	DiffInputTooLargeError,
	DiffParseError,
} from "./errors.ts";
import { DiffLanguage, MAX_DIFF_INPUT_CHARS } from "./types.ts";

// Domain input — a Schema.Struct per house convention; `language` reuses the
// DiffLanguage literal schema so the set of values stays single-sourced.
export const DiffInput = Schema.Struct({
	original: Schema.String,
	changed: Schema.String,
	language: DiffLanguage,
});

export type DiffInput = Schema.Schema.Type<typeof DiffInput>;

// Plain interface on purpose: this carries opaque @pierre/diffs objects
// (FileDiffMetadata, FileContents) and is only handed in-memory from the Effect
// to the React view — it never gets serialized or crosses a worker/RPC
// boundary. A Schema.Struct would only degrade those fields to Schema.Unknown.
// Mirrors the PngSpec precedent in lib/image/favicon.ts.
export interface DiffResult {
	readonly metadata: FileDiffMetadata;
	readonly oldFile: FileContents;
	readonly newFile: FileContents;
	// Whether the two inputs actually differ. Empty hunks => identical.
	readonly hasChanges: boolean;
	// Git-style line tallies for the summary (`+additions -deletions`).
	readonly additions: number;
	readonly deletions: number;
}

const toFileContents = (
	contents: string,
	language: DiffLanguage,
): FileContents => ({ name: "input", contents, lang: language });

// Reject pastes past the per-side cap before handing them to jsdiff/Shiki —
// an unbounded diff can lock the tab.
const validateSize = (
	input: DiffInput,
): Effect.Effect<void, DiffInputTooLargeError> => {
	const size = Math.max(input.original.length, input.changed.length);

	return size > MAX_DIFF_INPUT_CHARS
		? Effect.fail(
				new DiffInputTooLargeError({
					size,
					limit: MAX_DIFF_INPUT_CHARS,
					message: `Each side is limited to ${MAX_DIFF_INPUT_CHARS.toLocaleString()} characters. Trim the input and try again.`,
				}),
			)
		: Effect.void;
};

// Compute a side-by-side diff from the two raw inputs. parseDiffFromFile is
// synchronous (jsdiff under the hood); syntax highlighting happens later in the
// renderer's worker pool. throwOnError surfaces parse failures so we can map
// them onto the typed error channel instead of swallowing them.
export const computeDiff = (
	input: DiffInput,
): Effect.Effect<DiffResult, DiffError> =>
	Effect.gen(function* () {
		yield* validateSize(input);

		const oldFile = toFileContents(input.original, input.language);
		const newFile = toFileContents(input.changed, input.language);

		const metadata = yield* Effect.try({
			try: () => parseDiffFromFile(oldFile, newFile, undefined, true),
			catch: (cause) =>
				new DiffParseError({
					message:
						cause instanceof Error
							? cause.message
							: "Couldn't compute the difference between these inputs.",
				}),
		});

		const additions = metadata.hunks.reduce((n, h) => n + h.additionLines, 0);
		const deletions = metadata.hunks.reduce((n, h) => n + h.deletionLines, 0);

		return {
			metadata,
			oldFile,
			newFile,
			hasChanges: metadata.hunks.length > 0,
			additions,
			deletions,
		};
	});

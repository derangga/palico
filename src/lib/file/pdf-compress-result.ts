import { Data } from "effect";

import { isSmaller } from "./pdf-compress-presets.ts";
import type { CompressStats } from "./pdf-types.ts";

// How a compression ends when nothing went wrong. A PDF that is already as
// small as it gets is an outcome, not an error: the person gets their original
// back and a plain sentence, never a bigger file.
export type CompressOutcome = Data.TaggedEnum<{
	Compressed: {
		readonly blob: Blob;
		readonly originalSize: number;
		readonly size: number;
		readonly stats: CompressStats;
	};
	NotSmallerResult: {
		readonly originalSize: number;
		// What the passes produced, kept so the page can say how close it got.
		readonly size: number;
		readonly stats: CompressStats;
	};
}>;

export const { Compressed, NotSmallerResult, $match } =
	Data.taggedEnum<CompressOutcome>();

// Keep the output only when it is smaller than the original.
export const chooseOutcome = (
	originalSize: number,
	output: ArrayBuffer,
	stats: CompressStats,
): CompressOutcome =>
	isSmaller(originalSize, output.byteLength)
		? Compressed({
				blob: new Blob([output], { type: "application/pdf" }),
				originalSize,
				size: output.byteLength,
				stats,
			})
		: NotSmallerResult({ originalSize, size: output.byteLength, stats });

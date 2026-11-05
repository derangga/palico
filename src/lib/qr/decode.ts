// Finds and reads a QR code in a picture. Pure and synchronous, so it runs in a
// worker for files and for camera frames, and in plain node for tests.

import {
	adaptiveBits,
	type BitGrid,
	type Frame,
	invertBits,
	otsuBits,
	shrink,
	toGray,
} from "./binarize.ts";
import { findFinders, pickTriples } from "./finders.ts";
import {
	homographyFromFinders,
	homographyWithAlignment,
	sampleModules,
	versionGuesses,
} from "./geometry.ts";
import { type QrReading, readSymbol } from "./read-symbol.ts";
import { sizeOfVersion } from "./tables.ts";

export type { Frame, QrReading };

/**
 * "quick" suits a camera feed, where the next frame is 30 ms away: one pass
 * with two thresholds. "thorough" suits a file the user is waiting on: more
 * thresholds, a flipped pass for light-on-dark codes and a few smaller copies.
 */
export type Effort = "quick" | "thorough";

const MAX_SIDE = 2000;

function readGrid(grid: BitGrid): QrReading | undefined {
	for (const triple of pickTriples(findFinders(grid))) {
		for (const version of versionGuesses(triple)) {
			const dim = sizeOfVersion(version);
			const transforms = [
				homographyWithAlignment(grid, triple, dim),
				homographyFromFinders(triple, dim),
			];

			for (const transform of transforms) {
				if (!transform) continue;

				const reading = readSymbol(
					sampleModules(grid, transform, dim),
					version,
				);

				if (reading) return reading;
			}
		}
	}

	return undefined;
}

export function decodeFrame(
	frame: Frame,
	effort: Effort = "thorough",
): QrReading | undefined {
	const gray = toGray(frame);
	const base = Math.max(
		1,
		Math.ceil(Math.max(frame.width, frame.height) / MAX_SIDE),
	);
	// Shrinking helps on big photos but can alias thin modules away (3 px modules
	// halved to 1.5 px), so a thorough pass also tries the original pixels,
	// after the faster shrunken copies.
	const factors =
		effort === "quick" ? [base] : [...new Set([base, 1, base * 2, base * 4])];

	for (const factor of factors) {
		const scaled = shrink(gray, factor);

		// A shrunken copy this small has modules too thin to tell apart. The
		// original is always tried, however small.
		if (factor > 1 && Math.min(scaled.width, scaled.height) < 60) break;

		const grids: Array<() => BitGrid> =
			effort === "quick"
				? [() => adaptiveBits(scaled, 8), () => otsuBits(scaled)]
				: [
						() => adaptiveBits(scaled, 8),
						() => otsuBits(scaled),
						() => adaptiveBits(scaled, 32),
					];

		for (const makeGrid of grids) {
			const grid = makeGrid();
			const reading =
				readGrid(grid) ??
				(effort === "thorough" ? readGrid(invertBits(grid)) : undefined);

			if (reading) return reading;
		}
	}

	return undefined;
}

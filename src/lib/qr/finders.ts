// Finds the three big corner squares of a QR code. A finder pattern cuts any
// line through its centre into dark, light, dark, light, dark runs of
// 1:1:3:1:1. Rotation and mild perspective keep that ratio, so we scan rows,
// then confirm each hit down the column and back along the row.

import type { BitGrid } from "./binarize.ts";

export interface Finder {
	/** Centre, in pixel-edge coordinates (pixel k spans k to k + 1). */
	readonly x: number;
	readonly y: number;
	/** Estimated width of one module in pixels. */
	readonly size: number;
	/** Rows that agreed on this finder. */
	readonly count: number;
}

export interface Triple {
	/** The corner at the right angle. */
	readonly topLeft: Finder;
	readonly topRight: Finder;
	readonly bottomLeft: Finder;
}

function ratioMatches(counts: ReadonlyArray<number>): boolean {
	let total = 0;

	for (const count of counts) {
		if (count === 0) return false;
		total += count;
	}

	if (total < 7) return false;

	const unit = total / 7;
	const tolerance = unit * 0.55;

	// The middle run has its own tighter limit, so 1:1:1:1:1 (a stretch of
	// alternating data modules) is not mistaken for 1:1:3:1:1.
	return (
		Math.abs(unit - counts[0]!) < tolerance &&
		Math.abs(unit - counts[1]!) < tolerance &&
		Math.abs(3 * unit - counts[2]!) < 1.2 * unit &&
		Math.abs(unit - counts[3]!) < tolerance &&
		Math.abs(unit - counts[4]!) < tolerance
	);
}

interface Confirmed {
	readonly center: number;
	readonly total: number;
}

// Counts the five runs along one line, outward from a dark pixel in the middle
// run, and checks the 1:1:3:1:1 ratio and that the total width matches the
// pattern the row scan saw.
function crossCheck(
	at: (index: number) => number,
	length: number,
	start: number,
	expectedTotal: number,
): Confirmed | undefined {
	if (at(start) !== 1) return undefined;

	const counts = [0, 0, 0, 0, 0];
	let i = start;

	while (i >= 0 && at(i) === 1) {
		counts[2]!++;
		i--;
	}

	while (i >= 0 && at(i) === 0) {
		counts[1]!++;
		i--;
	}

	if (i < 0 || counts[1] === 0) return undefined;

	while (i >= 0 && at(i) === 1) {
		counts[0]!++;
		i--;
	}

	if (counts[0] === 0) return undefined;

	i = start + 1;

	while (i < length && at(i) === 1) {
		counts[2]!++;
		i++;
	}

	if (i >= length) return undefined;

	while (i < length && at(i) === 0) {
		counts[3]!++;
		i++;
	}

	if (i >= length || counts[3] === 0) return undefined;

	while (i < length && at(i) === 1) {
		counts[4]!++;
		i++;
	}

	if (counts[4] === 0) return undefined;

	const total = counts.reduce((sum, count) => sum + count, 0);

	if (5 * Math.abs(total - expectedTotal) >= 2 * expectedTotal)
		return undefined;

	if (!ratioMatches(counts)) return undefined;

	return { center: i - counts[4] - counts[3] - counts[2] / 2, total };
}

export function findFinders(grid: BitGrid): Finder[] {
	const { width, height, bits } = grid;

	const found: Array<{ x: number; y: number; size: number; count: number }> =
		[];

	const rowStep = height > 1500 ? 2 : 1;
	const runs = [0, 0, 0, 0, 0];

	// True when the candidate is a confirmed finder. The caller keeps its run
	// history when it is not, since the real pattern may start inside it.
	const record = (endX: number, y: number): boolean => {
		const total = runs.reduce((sum, run) => sum + run, 0);
		const guessX = endX - runs[4]! - runs[3]! - runs[2]! / 2;
		const column = Math.min(width - 1, Math.max(0, Math.floor(guessX)));

		const vertical = crossCheck(
			(i) => bits[i * width + column]!,
			height,
			y,
			total,
		);

		if (!vertical) return false;

		const row = Math.min(height - 1, Math.max(0, Math.floor(vertical.center)));

		const horizontal = crossCheck(
			(i) => bits[row * width + i]!,
			width,
			column,
			total,
		);

		if (!horizontal) return false;

		const x = horizontal.center;
		const cy = vertical.center;
		const size = (horizontal.total + vertical.total) / 14;

		const match = found.find(
			(f) =>
				Math.abs(f.x - x) <= f.size * 1.5 &&
				Math.abs(f.y - cy) <= f.size * 1.5 &&
				Math.abs(f.size - size) <= f.size * 0.5,
		);

		if (match) {
			const weight = match.count;

			match.x = (match.x * weight + x) / (weight + 1);
			match.y = (match.y * weight + cy) / (weight + 1);
			match.size = (match.size * weight + size) / (weight + 1);
			match.count++;
		} else {
			found.push({ x, y: cy, size, count: 1 });
		}

		return true;
	};

	for (let y = 0; y < height; y += rowStep) {
		runs.fill(0);
		let state = 0;

		for (let x = 0; x < width; x++) {
			const dark = bits[y * width + x] === 1;

			// Even states are dark runs, odd states are light runs.
			if (dark === (state % 2 === 0)) {
				runs[state]!++;
				continue;
			}

			// Still in the leading light margin: nothing to count yet.
			if (state === 0 && runs[0] === 0) continue;

			if (state < 4) {
				state++;
				runs[state] = 1;
				continue;
			}

			if (ratioMatches(runs) && record(x, y)) {
				runs.fill(0);
				state = 0;
			} else {
				runs[0] = runs[2]!;
				runs[1] = runs[3]!;
				runs[2] = runs[4]!;
				runs[3] = 1;
				runs[4] = 0;
				state = 3;
			}
		}

		if (state === 4 && ratioMatches(runs)) record(width, y);
	}

	return found
		.filter((f) => f.count >= 2)
		.sort((a, b) => b.count - a.count)
		.slice(0, 14);
}

const distance = (a: Finder, b: Finder) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Picks sets of three finders that form a right isosceles triangle with
 * similar module sizes, best first. Perspective bends the angle and the side
 * ratio, so the limits are loose and the ranking does the real selection.
 */
export function pickTriples(finders: ReadonlyArray<Finder>): Triple[] {
	const scored: Array<{ score: number; triple: Triple }> = [];

	for (let i = 0; i < finders.length; i++) {
		for (let j = i + 1; j < finders.length; j++) {
			for (let k = j + 1; k < finders.length; k++) {
				const trio = [finders[i]!, finders[j]!, finders[k]!];

				const sides = [
					distance(trio[1]!, trio[2]!),
					distance(trio[0]!, trio[2]!),
					distance(trio[0]!, trio[1]!),
				];

				// The corner opposite the longest side is the right angle.
				const cornerIndex = sides.indexOf(Math.max(...sides));
				const corner = trio[cornerIndex]!;
				const others = trio.filter((_, n) => n !== cornerIndex);
				const a = others[0]!;
				const b = others[1]!;
				const da = distance(corner, a);
				const db = distance(corner, b);

				const cosine =
					((a.x - corner.x) * (b.x - corner.x) +
						(a.y - corner.y) * (b.y - corner.y)) /
					(da * db);

				const sideRatio = Math.min(da, db) / Math.max(da, db);
				const sizes = trio.map((f) => f.size);
				const sizeRatio = Math.min(...sizes) / Math.max(...sizes);
				const unit = sizes.reduce((sum, size) => sum + size, 0) / 3;
				const span = (da + db) / 2 / unit;

				if (Math.abs(cosine) > 0.5 || sideRatio < 0.55 || sizeRatio < 0.5)
					continue;

				// Version 1 puts finder centres 14 modules apart; version 40, 170.
				if (span < 11 || span > 190) continue;

				const cross =
					(a.x - corner.x) * (b.y - corner.y) -
					(a.y - corner.y) * (b.x - corner.x);

				const [topRight, bottomLeft] = cross > 0 ? [a, b] : [b, a];

				scored.push({
					score: Math.abs(cosine) + (1 - sideRatio) + (1 - sizeRatio),
					triple: { topLeft: corner, topRight, bottomLeft },
				});
			}
		}
	}

	return scored
		.sort((x, y) => x.score - y.score)
		.slice(0, 6)
		.map((entry) => entry.triple);
}

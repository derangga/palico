// Finds the dominant colors of an image. Pure and synchronous: it runs in the
// worker, and in plain node for the tests. Same pixels in, same palette out.
//
// 1. Bucket every opaque pixel into one of 4,096 bins (4 bits per channel).
//    Each bin keeps its pixel count and its mean color, so large photos
//    collapse to a few thousand points before any clustering.
// 2. Cluster the bins with a weighted k-means in OKLab, where distance matches
//    how different two colors look. Seeds are picked by weight and distance,
//    not at random, so results never change between runs.
// 3. Merge clusters that look alike, drop specks, sort by area.

import {
	type Oklab,
	oklabDistance,
	oklabToRgb,
	type Rgb,
	rgbToOklab,
} from "./oklab.ts";

export interface PaletteColor {
	readonly rgb: Rgb;
	/** Fraction of the visible pixels this color stands for, 0 to 1. */
	readonly share: number;
}

export const MAX_PALETTE_COLORS = 10;

const BITS_PER_CHANNEL = 4;
const SHIFT = 8 - BITS_PER_CHANNEL;
const BIN_COUNT = 1 << (BITS_PER_CHANNEL * 3);

// Pixels at least half transparent are not part of the picture.
const ALPHA_CUTOFF = 128;

// More seeds than colors shown, so merging has similar shades to fold together.
const SEED_COUNT = MAX_PALETTE_COLORS + 2;
const MAX_ITERATIONS = 12;

// Two colors closer than this in OKLab read as one color.
const MERGE_DISTANCE = 0.05;

// Below this a color is a speck, not part of the palette.
const MIN_SHARE = 0.005;

interface Point {
	readonly lab: Oklab;
	readonly weight: number;
}

interface Cluster {
	lab: Oklab;
	weight: number;
}

const squaredDistance = (x: Oklab, y: Oklab): number =>
	(x.L - y.L) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2;

function bucket(pixels: Uint8ClampedArray): {
	readonly points: ReadonlyArray<Point>;
	readonly total: number;
} {
	const counts = new Float64Array(BIN_COUNT);
	const reds = new Float64Array(BIN_COUNT);
	const greens = new Float64Array(BIN_COUNT);
	const blues = new Float64Array(BIN_COUNT);
	let total = 0;

	for (let i = 0; i + 3 < pixels.length; i += 4) {
		if (pixels[i + 3]! < ALPHA_CUTOFF) continue;

		const r = pixels[i]!;
		const g = pixels[i + 1]!;
		const b = pixels[i + 2]!;

		const bin =
			((r >> SHIFT) << (BITS_PER_CHANNEL * 2)) |
			((g >> SHIFT) << BITS_PER_CHANNEL) |
			(b >> SHIFT);

		counts[bin]!++;
		reds[bin]! += r;
		greens[bin]! += g;
		blues[bin]! += b;
		total++;
	}

	const points: Point[] = [];

	for (let bin = 0; bin < BIN_COUNT; bin++) {
		const count = counts[bin]!;

		if (count === 0) continue;

		points.push({
			lab: rgbToOklab({
				r: reds[bin]! / count,
				g: greens[bin]! / count,
				b: blues[bin]! / count,
			}),
			weight: count,
		});
	}

	return { points, total };
}

// Heaviest point first, then repeatedly the point with the most weight times
// squared distance from the seeds so far. Heavy and far wins; a lone noisy
// pixel does not.
function pickSeeds(points: ReadonlyArray<Point>, count: number): Oklab[] {
	let first = 0;

	for (let i = 1; i < points.length; i++) {
		if (points[i]!.weight > points[first]!.weight) first = i;
	}

	const seeds = [points[first]!.lab];
	const nearest = points.map((point) => squaredDistance(point.lab, seeds[0]!));

	while (seeds.length < count) {
		let best = -1;
		let bestScore = 0;

		for (let i = 0; i < points.length; i++) {
			const score = points[i]!.weight * nearest[i]!;

			if (score > bestScore) {
				best = i;
				bestScore = score;
			}
		}

		// Every point already sits on a seed.
		if (best < 0) break;

		const seed = points[best]!.lab;

		seeds.push(seed);

		for (let i = 0; i < points.length; i++) {
			nearest[i] = Math.min(nearest[i]!, squaredDistance(points[i]!.lab, seed));
		}
	}

	return seeds;
}

function cluster(points: ReadonlyArray<Point>): Cluster[] {
	const clusters: Cluster[] = pickSeeds(points, SEED_COUNT).map((lab) => ({
		lab,
		weight: 0,
	}));

	const assignment = new Int32Array(points.length).fill(-1);

	for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
		let changed = false;

		for (let i = 0; i < points.length; i++) {
			let nearest = 0;
			let nearestDistance = Infinity;

			for (let c = 0; c < clusters.length; c++) {
				const distance = squaredDistance(points[i]!.lab, clusters[c]!.lab);

				if (distance < nearestDistance) {
					nearest = c;
					nearestDistance = distance;
				}
			}

			if (assignment[i] !== nearest) {
				assignment[i] = nearest;
				changed = true;
			}
		}

		const sums = clusters.map(() => ({ L: 0, a: 0, b: 0, weight: 0 }));

		for (let i = 0; i < points.length; i++) {
			const { lab, weight } = points[i]!;
			const sum = sums[assignment[i]!]!;

			sum.L += lab.L * weight;
			sum.a += lab.a * weight;
			sum.b += lab.b * weight;
			sum.weight += weight;
		}

		for (let c = 0; c < clusters.length; c++) {
			const sum = sums[c]!;

			clusters[c]!.weight = sum.weight;

			if (sum.weight > 0) {
				clusters[c]!.lab = {
					L: sum.L / sum.weight,
					a: sum.a / sum.weight,
					b: sum.b / sum.weight,
				};
			}
		}

		if (!changed) break;
	}

	return clusters.filter((item) => item.weight > 0);
}

// Folds each cluster into the first heavier one that looks the same, so the
// palette does not list three near-identical blues.
function mergePass(clusters: ReadonlyArray<Cluster>): Cluster[] {
	const byWeight = clusters.toSorted((x, y) => y.weight - x.weight);
	const merged: Cluster[] = [];

	for (const item of byWeight) {
		const match = merged.find(
			(kept) => oklabDistance(kept.lab, item.lab) < MERGE_DISTANCE,
		);

		if (!match) {
			merged.push({ lab: item.lab, weight: item.weight });
			continue;
		}

		const weight = match.weight + item.weight;

		match.lab = {
			L: (match.lab.L * match.weight + item.lab.L * item.weight) / weight,
			a: (match.lab.a * match.weight + item.lab.a * item.weight) / weight,
			b: (match.lab.b * match.weight + item.lab.b * item.weight) / weight,
		};
		match.weight = weight;
	}

	return merged;
}

// A merged center moves, and can land near a cluster that was kept earlier, so
// repeat until a pass folds nothing. At most a dozen clusters, so this is cheap.
function mergeSimilar(clusters: ReadonlyArray<Cluster>): Cluster[] {
	let merged = mergePass(clusters);
	let previous = clusters.length;

	while (merged.length < previous) {
		previous = merged.length;
		merged = mergePass(merged);
	}

	return merged;
}

/**
 * The dominant colors of an RGBA pixel buffer, biggest area first. Empty when
 * no pixel is visible. `maxColors` caps the result.
 */
export function extractPalette(
	pixels: Uint8ClampedArray,
	maxColors = MAX_PALETTE_COLORS,
): ReadonlyArray<PaletteColor> {
	const { points, total } = bucket(pixels);

	if (total === 0) return [];

	return mergeSimilar(cluster(points))
		.toSorted((x, y) => y.weight - x.weight)
		.flatMap((item) => {
			const share = item.weight / total;

			return share >= MIN_SHARE ? [{ rgb: oklabToRgb(item.lab), share }] : [];
		})
		.slice(0, maxColors);
}

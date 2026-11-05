// Maps module coordinates (a grid of dim x dim cells) onto image pixels with a
// perspective transform, then samples one bit per module.

import type { BitGrid } from "./binarize.ts";
import type { Finder, Triple } from "./finders.ts";

export type Pair = readonly [number, number];

/** Eight coefficients a..h of x = (au+bv+c)/(gu+hv+1), y = (du+ev+f)/(gu+hv+1). */
export type Homography = ReadonlyArray<number>;

export function solveHomography(
	from: ReadonlyArray<Pair>,
	to: ReadonlyArray<Pair>,
): Homography | undefined {
	const matrix: number[][] = [];

	for (let i = 0; i < 4; i++) {
		const [u, v] = from[i]!;
		const [x, y] = to[i]!;

		matrix.push([u, v, 1, 0, 0, 0, -u * x, -v * x, x]);
		matrix.push([0, 0, 0, u, v, 1, -u * y, -v * y, y]);
	}

	// Gaussian elimination with partial pivoting.
	for (let col = 0; col < 8; col++) {
		let pivot = col;

		for (let row = col + 1; row < 8; row++) {
			if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!))
				pivot = row;
		}

		if (Math.abs(matrix[pivot]![col]!) < 1e-10) return undefined;

		[matrix[col], matrix[pivot]] = [matrix[pivot]!, matrix[col]!];

		for (let row = 0; row < 8; row++) {
			if (row === col) continue;

			const factor = matrix[row]![col]! / matrix[col]![col]!;

			for (let k = col; k < 9; k++)
				matrix[row]![k]! -= factor * matrix[col]![k]!;
		}
	}

	return matrix.map((row, i) => row[8]! / row[i]!);
}

export function project(h: Homography, u: number, v: number): Pair {
	const w = h[6]! * u + h[7]! * v + 1;

	return [
		(h[0]! * u + h[1]! * v + h[2]!) / w,
		(h[3]! * u + h[4]! * v + h[5]!) / w,
	];
}

const pixelAt = (grid: BitGrid, x: number, y: number): number => {
	const px = Math.floor(x);
	const py = Math.floor(y);

	if (px < 0 || py < 0 || px >= grid.width || py >= grid.height) return 0;

	return grid.bits[py * grid.width + px]!;
};

// Five taps per module (centre plus four nudges) so one stray pixel or a
// slightly off centre does not flip a module. Anything out of frame is light.
const TAPS: ReadonlyArray<Pair> = [
	[0, 0],
	[0.25, 0],
	[-0.25, 0],
	[0, 0.25],
	[0, -0.25],
];

export function sampleModules(
	grid: BitGrid,
	h: Homography,
	dim: number,
): Uint8Array {
	const modules = new Uint8Array(dim * dim);

	for (let y = 0; y < dim; y++) {
		for (let x = 0; x < dim; x++) {
			let votes = 0;

			for (const [dx, dy] of TAPS) {
				const [px, py] = project(h, x + 0.5 + dx, y + 0.5 + dy);

				votes += pixelAt(grid, px, py);
			}

			modules[y * dim + x] = votes >= 3 ? 1 : 0;
		}
	}

	return modules;
}

/** Module coordinates of the finder centres and the alignment pattern in a code of `dim` modules. */
const FINDER_CENTER = 3.5;

/**
 * The transform implied by the three finders alone: the bottom-right corner is
 * guessed as a parallelogram. Exact for a flat, undistorted code.
 */
export function homographyFromFinders(
	triple: Triple,
	dim: number,
): Homography | undefined {
	const { topLeft: tl, topRight: tr, bottomLeft: bl } = triple;
	const far = dim - FINDER_CENTER;

	return solveHomography(
		[
			[FINDER_CENTER, FINDER_CENTER],
			[far, FINDER_CENTER],
			[FINDER_CENTER, far],
			[far, far],
		],
		[
			[tl.x, tl.y],
			[tr.x, tr.y],
			[bl.x, bl.y],
			[tr.x + bl.x - tl.x, tr.y + bl.y - tl.y],
		],
	);
}

// How well a 5x5 alignment pattern (dark centre, light ring, dark border)
// sits at an image point, given the pixel steps of one module along each axis.
function alignmentScore(
	grid: BitGrid,
	cx: number,
	cy: number,
	stepX: Pair,
	stepY: Pair,
): number {
	let score = 0;

	for (let dy = -2; dy <= 2; dy++) {
		for (let dx = -2; dx <= 2; dx++) {
			const expected = Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 0 : 1;
			const x = cx + stepX[0] * dx + stepY[0] * dy;
			const y = cy + stepX[1] * dx + stepY[1] * dy;

			if (pixelAt(grid, x, y) === expected) score++;
		}
	}

	return score;
}

/**
 * Looks for the bottom-right alignment pattern near where the finders predict
 * it. With a fourth true point the transform follows perspective, which a
 * parallelogram guess cannot. Returns undefined when nothing fits well.
 */
export function homographyWithAlignment(
	grid: BitGrid,
	triple: Triple,
	dim: number,
): Homography | undefined {
	if (dim < 25) return undefined;

	const { topLeft: tl, topRight: tr, bottomLeft: bl } = triple;
	const span = dim - 7;
	const stepX: Pair = [(tr.x - tl.x) / span, (tr.y - tl.y) / span];
	const stepY: Pair = [(bl.x - tl.x) / span, (bl.y - tl.y) / span];
	const offset = dim - 10;
	const guessX = tl.x + stepX[0] * offset + stepY[0] * offset;
	const guessY = tl.y + stepX[1] * offset + stepY[1] * offset;
	const unit = Math.hypot(stepX[0], stepX[1]);

	let best = { x: guessX, y: guessY, score: -1, distance: Infinity };

	const search = (
		range: number,
		step: number,
		centerX: number,
		centerY: number,
	) => {
		for (let oy = -range; oy <= range; oy += step) {
			for (let ox = -range; ox <= range; ox += step) {
				const x = centerX + ox;
				const y = centerY + oy;
				const score = alignmentScore(grid, x, y, stepX, stepY);
				const distance = Math.hypot(x - guessX, y - guessY);

				if (
					score > best.score ||
					(score === best.score && distance < best.distance)
				) {
					best = { x, y, score, distance };
				}
			}
		}
	};

	search(unit * 4, unit * 0.5, guessX, guessY);
	search(unit * 0.5, unit * 0.125, best.x, best.y);

	if (best.score < 21) return undefined;

	const far = dim - FINDER_CENTER;

	return solveHomography(
		[
			[FINDER_CENTER, FINDER_CENTER],
			[far, FINDER_CENTER],
			[FINDER_CENTER, far],
			[dim - 6.5, dim - 6.5],
		],
		[
			[tl.x, tl.y],
			[tr.x, tr.y],
			[bl.x, bl.y],
			[best.x, best.y],
		],
	);
}

/** Version numbers worth trying, nearest the size the finders imply first. */
export function versionGuesses(triple: Triple): number[] {
	const { topLeft: tl, topRight: tr, bottomLeft: bl } = triple;
	const unit = (tl.size + tr.size + bl.size) / 3;

	const modulesAcross =
		(Math.hypot(tr.x - tl.x, tr.y - tl.y) +
			Math.hypot(bl.x - tl.x, bl.y - tl.y)) /
			2 /
			unit +
		7;

	const estimate = Math.round((modulesAcross - 17) / 4);
	const guesses: number[] = [];

	for (const delta of [0, 1, -1, 2, -2]) {
		const version = estimate + delta;

		if (version >= 1 && version <= 40) guesses.push(version);
	}

	return guesses;
}

export type { Finder };

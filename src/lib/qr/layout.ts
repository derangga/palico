// The fixed geometry of a QR symbol: finder, timing and alignment patterns,
// the format and version areas, and the order data bits snake through the grid.
// The encoder writes through this layout and the decoder reads through it.

import {
	alignmentPositions,
	ECC_FORMAT_BITS,
	type EccLevel,
	sizeOfVersion,
} from "./tables.ts";

export interface Layout {
	readonly version: number;
	readonly size: number;
	/** Row-major, 1 is a dark module. Holds only the function patterns. */
	readonly modules: Uint8Array;
	/** Row-major, 1 where a module belongs to a function pattern or info area. */
	readonly isFunction: Uint8Array;
}

export type Point = readonly [x: number, y: number];

/** Grid positions of each of the 15 format bits, for the two stored copies. */
export function formatPositions(
	size: number,
): readonly [ReadonlyArray<Point>, ReadonlyArray<Point>] {
	const first: Point[] = [];
	const second: Point[] = [];

	for (let i = 0; i < 15; i++) {
		if (i <= 5) first.push([8, i]);
		else if (i === 6) first.push([8, 7]);
		else if (i === 7) first.push([8, 8]);
		else if (i === 8) first.push([7, 8]);
		else first.push([14 - i, 8]);

		if (i < 8) second.push([size - 1 - i, 8]);
		else second.push([8, size - 15 + i]);
	}

	return [first, second];
}

/** The 15-bit format word: 2 level bits, 3 mask bits, 10 BCH bits, then masked. */
export function formatCodeword(ecc: EccLevel, mask: number): number {
	const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
	let remainder = data;

	for (let i = 0; i < 10; i++) {
		remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
	}

	return ((data << 10) | remainder) ^ 0x5412;
}

/** The 18-bit version word (BCH-coded), stored in two 3x6 blocks for version 7 and up. */
export function versionCodeword(version: number): number {
	let remainder = version;

	for (let i = 0; i < 12; i++) {
		remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
	}

	return (version << 12) | remainder;
}

export function createLayout(version: number): Layout {
	const size = sizeOfVersion(version);
	const modules = new Uint8Array(size * size);
	const isFunction = new Uint8Array(size * size);

	const set = (x: number, y: number, dark: boolean) => {
		modules[y * size + x] = dark ? 1 : 0;
		isFunction[y * size + x] = 1;
	};

	for (let i = 0; i < size; i++) {
		set(6, i, i % 2 === 0);
		set(i, 6, i % 2 === 0);
	}

	// Finder patterns with their one-module separators.
	for (const [cx, cy] of [
		[3, 3],
		[size - 4, 3],
		[3, size - 4],
	] as const) {
		for (let dy = -4; dy <= 4; dy++) {
			for (let dx = -4; dx <= 4; dx++) {
				const x = cx + dx;
				const y = cy + dy;

				if (x < 0 || y < 0 || x >= size || y >= size) continue;

				const ring = Math.max(Math.abs(dx), Math.abs(dy));

				set(x, y, ring !== 2 && ring !== 4);
			}
		}
	}

	const positions = alignmentPositions(version);
	const last = positions.length - 1;

	positions.forEach((cx, i) => {
		positions.forEach((cy, j) => {
			// The three corners where an alignment pattern would hit a finder.
			if (
				(i === 0 && j === 0) ||
				(i === 0 && j === last) ||
				(i === last && j === 0)
			) {
				return;
			}

			for (let dy = -2; dy <= 2; dy++) {
				for (let dx = -2; dx <= 2; dx++) {
					set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
				}
			}
		});
	});

	// Reserve the format areas and the always-dark module.
	for (const copy of formatPositions(size)) {
		for (const [x, y] of copy) set(x, y, false);
	}

	set(8, size - 8, true);

	if (version >= 7) {
		const bits = versionCodeword(version);

		for (let i = 0; i < 18; i++) {
			const dark = ((bits >>> i) & 1) === 1;
			const a = size - 11 + (i % 3);
			const b = Math.floor(i / 3);

			set(a, b, dark);
			set(b, a, dark);
		}
	}

	return { version, size, modules, isFunction };
}

/**
 * Module indices (y * size + x) in the order the codeword bits occupy them:
 * two-column strips from the right edge, alternating up and down, skipping
 * the vertical timing column and every function module.
 */
export function dataModuleOrder(layout: Layout): Int32Array {
	const { size, isFunction } = layout;
	const order: number[] = [];

	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;

		const upward = ((right + 1) & 2) === 0;

		for (let step = 0; step < size; step++) {
			const y = upward ? size - 1 - step : step;

			for (let j = 0; j < 2; j++) {
				const x = right - j;

				if (isFunction[y * size + x] === 0) order.push(y * size + x);
			}
		}
	}

	return Int32Array.from(order);
}

/** The eight mask conditions: true flips the module at (x, y). */
export function maskFlips(mask: number, x: number, y: number): boolean {
	switch (mask) {
		case 0:
			return (x + y) % 2 === 0;
		case 1:
			return y % 2 === 0;
		case 2:
			return x % 3 === 0;
		case 3:
			return (x + y) % 3 === 0;
		case 4:
			return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
		case 5:
			return ((x * y) % 2) + ((x * y) % 3) === 0;
		case 6:
			return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
		default:
			return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
	}
}

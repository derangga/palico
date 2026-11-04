// Reed-Solomon over GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1
// (0x11D). The generator has roots a^0 .. a^(n-1).

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

{
	let value = 1;

	for (let i = 0; i < 255; i++) {
		EXP[i] = value;
		LOG[value] = i;
		value <<= 1;

		if (value & 0x100) value ^= 0x11d;
	}

	// Doubled so a product of two logs never needs a modulo.
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
}

export const gfMul = (a: number, b: number): number =>
	a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;

const gfDiv = (a: number, b: number): number =>
	a === 0 ? 0 : EXP[LOG[a]! + 255 - LOG[b]!]!;

const gfPow = (exponent: number): number =>
	EXP[((exponent % 255) + 255) % 255]!;

// Coefficients of the monic generator, highest degree first, leading 1 omitted.
function generator(degree: number): Uint8Array {
	const coefficients = new Uint8Array(degree);

	coefficients[degree - 1] = 1;

	let root = 1;

	for (let i = 0; i < degree; i++) {
		for (let j = 0; j < degree; j++) {
			coefficients[j] = gfMul(coefficients[j]!, root);

			if (j + 1 < degree) coefficients[j]! ^= coefficients[j + 1]!;
		}

		root = gfMul(root, 2);
	}

	return coefficients;
}

/** The `eccLength` error correction bytes for a block of data bytes. */
export function rsEncode(
	data: ReadonlyArray<number>,
	eccLength: number,
): Uint8Array {
	const divisor = generator(eccLength);
	const remainder = new Uint8Array(eccLength);

	for (const byte of data) {
		const factor = byte ^ remainder[0]!;

		remainder.copyWithin(0, 1);
		remainder[eccLength - 1] = 0;

		for (let i = 0; i < eccLength; i++) {
			remainder[i]! ^= gfMul(divisor[i]!, factor);
		}
	}

	return remainder;
}

function syndromes(block: Iterable<number>, count: number): Uint8Array {
	const result = new Uint8Array(count);

	for (let j = 0; j < count; j++) {
		const alpha = gfPow(j);
		let sum = 0;

		for (const byte of block) sum = gfMul(sum, alpha) ^ byte;
		result[j] = sum;
	}

	return result;
}

const evaluate = (poly: ReadonlyArray<number>, x: number): number => {
	let sum = 0;

	for (let i = poly.length - 1; i >= 0; i--) sum = gfMul(sum, x) ^ poly[i]!;

	return sum;
};

/**
 * Corrects a block (data followed by `eccLength` check bytes) in place.
 * Returns false when there are more errors than the code can repair.
 */
export function rsCorrect(block: Uint8Array, eccLength: number): boolean {
	const s = syndromes(block, eccLength);

	if (s.every((value) => value === 0)) return true;

	// Berlekamp-Massey. Polynomials are stored lowest degree first.
	let locator = [1];
	let previous = [1];
	let errors = 0;
	let gap = 1;
	let previousDiscrepancy = 1;

	for (let n = 0; n < eccLength; n++) {
		let discrepancy = s[n]!;

		for (let i = 1; i <= errors; i++) {
			discrepancy ^= gfMul(locator[i] ?? 0, s[n - i]!);
		}

		if (discrepancy === 0) {
			gap++;
			continue;
		}

		const scale = gfDiv(discrepancy, previousDiscrepancy);
		const updated = locator.slice();

		while (updated.length < previous.length + gap) updated.push(0);

		for (let i = 0; i < previous.length; i++) {
			updated[i + gap]! ^= gfMul(scale, previous[i]!);
		}

		if (2 * errors <= n) {
			previous = locator;
			errors = n + 1 - errors;
			previousDiscrepancy = discrepancy;
			gap = 1;
		} else {
			gap++;
		}

		locator = updated;
	}

	if (errors === 0 || errors * 2 > eccLength) return false;

	// Chien search: position p (counted from the end) is wrong when
	// locator(a^-p) is zero.
	const length = block.length;
	const positions: number[] = [];

	for (let p = 0; p < length; p++) {
		if (evaluate(locator, gfPow(-p)) === 0) positions.push(p);
	}

	if (positions.length !== errors) return false;

	// Forney: error value = X * omega(1/X) / locator'(1/X), where
	// omega = s(x) * locator(x) mod x^eccLength.
	const omega: number[] = [];

	for (let i = 0; i < eccLength; i++) {
		let sum = 0;

		for (let j = 0; j <= i && j < locator.length; j++) {
			sum ^= gfMul(locator[j]!, s[i - j]!);
		}

		omega.push(sum);
	}

	// Formal derivative in characteristic 2 keeps only odd-degree terms.
	const derivative: number[] = [];

	for (let i = 1; i < locator.length; i += 2) {
		derivative[i - 1] = locator[i]!;
	}

	for (const p of positions) {
		const inverse = gfPow(-p);
		const denominator = evaluate(derivative, inverse);

		if (denominator === 0) return false;

		const magnitude = gfMul(
			gfPow(p),
			gfDiv(evaluate(omega, inverse), denominator),
		);

		block[length - 1 - p]! ^= magnitude;
	}

	return syndromes(block, eccLength).every((value) => value === 0);
}

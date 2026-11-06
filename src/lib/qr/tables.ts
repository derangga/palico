import { m } from "#/paraglide/messages.js";

// Constants and size arithmetic from the QR Code spec (ISO/IEC 18004), model 2.
// Shared by the encoder and the decoder, so both agree on every layout detail.

export type EccLevel = "L" | "M" | "Q" | "H";

export const ECC_LEVELS: ReadonlyArray<EccLevel> = ["L", "M", "Q", "H"];

export type QrMode = "numeric" | "alphanumeric" | "byte";

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// Index 0 is unused so the arrays read by version number.
const ECC_CODEWORDS_PER_BLOCK: Record<EccLevel, ReadonlyArray<number>> = {
	L: [
		0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30,
		28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
		30, 30, 30,
	],
	M: [
		0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
		26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
		28, 28, 28,
	],
	Q: [
		0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28,
		26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
		30, 30, 30,
	],
	H: [
		0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28,
		26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
		30, 30, 30,
	],
};

const BLOCK_COUNT: Record<EccLevel, ReadonlyArray<number>> = {
	L: [
		0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10,
		12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25,
	],
	M: [
		0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17,
		18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
	],
	Q: [
		0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23,
		23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68,
	],
	H: [
		0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25,
		34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81,
	],
};

// The two format bits that name each level in the format information.
export const ECC_FORMAT_BITS: Record<EccLevel, number> = {
	L: 1,
	M: 0,
	Q: 3,
	H: 2,
};

export const ALPHANUMERIC_CHARS =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export const MODE_INDICATOR: Record<QrMode, number> = {
	numeric: 1,
	alphanumeric: 2,
	byte: 4,
};

/** What `length` counts in each mode, for messages. */
/** The unit a mode counts in, worded in the active language. */
export const unitLabel = (unit: "digits" | "characters" | "bytes"): string => {
	switch (unit) {
		case "digits":
			return m.qr_unit_digits();
		case "characters":
			return m.qr_unit_characters();
		case "bytes":
			return m.qr_unit_bytes();
	}
};

export const MODE_UNIT: Record<QrMode, "digits" | "characters" | "bytes"> = {
	numeric: "digits",
	alphanumeric: "characters",
	byte: "bytes",
};

export const sizeOfVersion = (version: number): number => version * 4 + 17;

export const versionOfSize = (size: number): number => (size - 17) / 4;

/** Centres of the alignment patterns along one axis, e.g. [6, 22, 38] for version 7. */
export function alignmentPositions(version: number): ReadonlyArray<number> {
	if (version === 1) return [];

	const count = Math.floor(version / 7) + 2;
	const size = sizeOfVersion(version);

	const step =
		version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;

	const positions = [6];

	for (let pos = size - 7; positions.length < count; pos -= step) {
		positions.splice(1, 0, pos);
	}

	return positions;
}

/** Modules that can hold data or error correction (everything except function patterns). */
export function rawDataModules(version: number): number {
	let modules = (16 * version + 128) * version + 64;

	if (version >= 2) {
		const count = Math.floor(version / 7) + 2;

		modules -= (25 * count - 10) * count - 55;

		if (version >= 7) modules -= 36;
	}

	return modules;
}

export const rawCodewords = (version: number): number =>
	Math.floor(rawDataModules(version) / 8);

export const eccCodewordsPerBlock = (version: number, ecc: EccLevel): number =>
	ECC_CODEWORDS_PER_BLOCK[ecc][version] ?? 0;

export const blockCount = (version: number, ecc: EccLevel): number =>
	BLOCK_COUNT[ecc][version] ?? 0;

export const dataCodewords = (version: number, ecc: EccLevel): number =>
	rawCodewords(version) -
	eccCodewordsPerBlock(version, ecc) * blockCount(version, ecc);

const COUNT_BITS: Record<QrMode, readonly [number, number, number]> = {
	numeric: [10, 12, 14],
	alphanumeric: [9, 11, 13],
	byte: [8, 16, 16],
};

/** Width of the character-count field, which grows with the version. */
export function countBits(mode: QrMode, version: number): number {
	const [small, medium, large] = COUNT_BITS[mode];

	if (version <= 9) return small;

	return version <= 26 ? medium : large;
}

/** Bits a payload of `length` characters takes in `mode`, before header and padding. */
export function payloadBits(mode: QrMode, length: number): number {
	switch (mode) {
		case "numeric":
			return Math.floor(length / 3) * 10 + [0, 4, 7][length % 3]!;
		case "alphanumeric":
			return Math.floor(length / 2) * 11 + (length % 2) * 6;
		case "byte":
			return length * 8;
	}
}

/** Most characters of `mode` that fit in a version at an error correction level. */
export function maxCharacters(
	mode: QrMode,
	version: number,
	ecc: EccLevel,
): number {
	const bits = dataCodewords(version, ecc) * 8 - 4 - countBits(mode, version);

	if (bits <= 0) return 0;

	switch (mode) {
		case "numeric": {
			const rest = bits % 10;

			return Math.floor(bits / 10) * 3 + (rest >= 7 ? 2 : rest >= 4 ? 1 : 0);
		}

		case "alphanumeric":
			return Math.floor(bits / 11) * 2 + (bits % 11 >= 6 ? 1 : 0);
		case "byte":
			return Math.floor(bits / 8);
	}
}

/** The smallest version that holds the payload, or undefined when none does. */
export function smallestVersion(
	mode: QrMode,
	length: number,
	ecc: EccLevel,
): number | undefined {
	const bits = payloadBits(mode, length);

	for (let version = MIN_VERSION; version <= MAX_VERSION; version++) {
		if (
			4 + countBits(mode, version) + bits <=
			dataCodewords(version, ecc) * 8
		) {
			return version;
		}
	}

	return undefined;
}

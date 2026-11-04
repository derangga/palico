// Reads a sampled module grid: format info, unmasking, error correction and
// the text segments. The inverse of encode.ts.

import {
	createLayout,
	dataModuleOrder,
	formatCodeword,
	formatPositions,
	maskFlips,
} from "./layout.ts";
import { rsCorrect } from "./reed-solomon.ts";
import {
	ALPHANUMERIC_CHARS,
	blockCount,
	countBits,
	dataCodewords,
	ECC_LEVELS,
	type EccLevel,
	eccCodewordsPerBlock,
	rawCodewords,
	sizeOfVersion,
} from "./tables.ts";

export interface QrReading {
	readonly text: string;
	readonly version: number;
	readonly ecc: EccLevel;
}

interface FormatInfo {
	readonly ecc: EccLevel;
	readonly mask: number;
}

const FORMAT_CANDIDATES: ReadonlyArray<FormatInfo & { readonly word: number }> =
	ECC_LEVELS.flatMap((ecc) =>
		Array.from({ length: 8 }, (_, mask) => ({
			ecc,
			mask,
			word: formatCodeword(ecc, mask),
		})),
	);

const bitCount = (value: number): number => {
	let count = 0;

	for (let v = value; v !== 0; v >>>= 1) count += v & 1;

	return count;
};

// The two stored copies each tolerate a few flipped bits. Take the closest
// valid word, and give up beyond 3 flips (the code's own limit is 3).
function readFormat(modules: Uint8Array, size: number): FormatInfo | undefined {
	const [first, second] = formatPositions(size);
	const readCopy = (positions: ReadonlyArray<readonly [number, number]>) =>
		positions.reduce(
			(word, [x, y], bit) => word | (modules[y * size + x]! << bit),
			0,
		);
	const copies = [readCopy(first), readCopy(second)];

	let best: FormatInfo | undefined;
	let bestDistance = 4;

	for (const candidate of FORMAT_CANDIDATES) {
		for (const copy of copies) {
			const distance = bitCount(copy ^ candidate.word);

			if (distance < bestDistance) {
				bestDistance = distance;
				best = candidate;
			}
		}
	}

	return best;
}

// Undo the interleave from encode.ts and repair each block.
function correctBlocks(
	stream: Uint8Array,
	version: number,
	ecc: EccLevel,
): Uint8Array | undefined {
	const blocks = blockCount(version, ecc);
	const eccLength = eccCodewordsPerBlock(version, ecc);
	const total = rawCodewords(version);
	const shortBlocks = blocks - (total % blocks);
	const shortLength = Math.floor(total / blocks);
	const dataLengths = Array.from(
		{ length: blocks },
		(_, i) => shortLength - eccLength + (i < shortBlocks ? 0 : 1),
	);
	const buffers = dataLengths.map(
		(length) => new Uint8Array(length + eccLength),
	);
	let position = 0;

	for (let i = 0; i < shortLength - eccLength + 1; i++) {
		buffers.forEach((buffer, b) => {
			if (i < dataLengths[b]!) buffer[i] = stream[position++]!;
		});
	}

	for (let i = 0; i < eccLength; i++) {
		buffers.forEach((buffer, b) => {
			buffer[dataLengths[b]! + i] = stream[position++]!;
		});
	}

	const data = new Uint8Array(dataCodewords(version, ecc));
	let offset = 0;

	for (const [b, buffer] of buffers.entries()) {
		if (!rsCorrect(buffer, eccLength)) return undefined;

		data.set(buffer.subarray(0, dataLengths[b]!), offset);
		offset += dataLengths[b]!;
	}

	return data;
}

class BitReader {
	private position = 0;
	private readonly bytes: Uint8Array;

	constructor(bytes: Uint8Array) {
		this.bytes = bytes;
	}

	get remaining(): number {
		return this.bytes.length * 8 - this.position;
	}

	read(length: number): number {
		let value = 0;

		for (let i = 0; i < length; i++) {
			const byte = this.bytes[this.position >>> 3]!;

			value = (value << 1) | ((byte >>> (7 - (this.position & 7))) & 1);
			this.position++;
		}

		return value;
	}
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
	try {
		return new TextDecoder(charset, { fatal: true }).decode(bytes);
	} catch {
		// Many encoders write Latin-1 bytes without an ECI marker.
		return new TextDecoder("windows-1252").decode(bytes);
	}
}

// Character sets named by an ECI designator. Anything else is read as UTF-8.
function charsetForEci(designator: number): string {
	switch (designator) {
		case 3:
			return "iso-8859-1";
		case 20:
			return "shift_jis";
		default:
			return "utf-8";
	}
}

function parseSegments(data: Uint8Array, version: number): string | undefined {
	const reader = new BitReader(data);
	let text = "";
	let charset = "utf-8";

	while (reader.remaining >= 4) {
		const mode = reader.read(4);

		if (mode === 0) break;

		switch (mode) {
			case 1: {
				let count = reader.read(countBits("numeric", version));

				while (count > 0) {
					const digits = Math.min(count, 3);
					const bits = digits * 3 + 1;

					if (reader.remaining < bits) return undefined;

					text += String(reader.read(bits)).padStart(digits, "0");
					count -= digits;
				}
				break;
			}
			case 2: {
				let count = reader.read(countBits("alphanumeric", version));

				while (count > 0) {
					if (count >= 2) {
						if (reader.remaining < 11) return undefined;

						const pair = reader.read(11);

						text += ALPHANUMERIC_CHARS[Math.floor(pair / 45)] ?? "";
						text += ALPHANUMERIC_CHARS[pair % 45] ?? "";
						count -= 2;
					} else {
						if (reader.remaining < 6) return undefined;

						text += ALPHANUMERIC_CHARS[reader.read(6)] ?? "";
						count -= 1;
					}
				}
				break;
			}
			case 4: {
				const count = reader.read(countBits("byte", version));

				if (reader.remaining < count * 8) return undefined;

				const bytes = new Uint8Array(count);

				for (let i = 0; i < count; i++) bytes[i] = reader.read(8);

				text += decodeBytes(bytes, charset);
				break;
			}
			case 8: {
				// Kanji: 13 bits per Shift JIS character. Counts have their own widths.
				const count = reader.read(version <= 9 ? 8 : version <= 26 ? 10 : 12);

				if (reader.remaining < count * 13) return undefined;

				const bytes = new Uint8Array(count * 2);

				for (let i = 0; i < count; i++) {
					const value = reader.read(13);
					const assembled = (Math.floor(value / 0xc0) << 8) | (value % 0xc0);
					const code =
						assembled + (assembled + 0x8140 <= 0x9ffc ? 0x8140 : 0xc140);

					bytes[i * 2] = code >> 8;
					bytes[i * 2 + 1] = code & 0xff;
				}

				text += decodeBytes(bytes, "shift_jis");
				break;
			}
			case 7: {
				// ECI designators are 1 to 3 bytes; the leading bits give the length.
				const first = reader.read(8);
				let designator = first;

				if ((first & 0xc0) === 0x80) {
					designator = ((first & 0x3f) << 8) | reader.read(8);
				} else if ((first & 0xe0) === 0xc0) {
					designator = ((first & 0x1f) << 16) | reader.read(16);
				}

				charset = charsetForEci(designator);
				break;
			}
			case 3:
				// Structured append: parity and position of this symbol in a set.
				reader.read(16);
				break;
			case 5:
				// FNC1 in first position: a flag only.
				break;
			case 9:
				// FNC1 in second position: an application indicator byte.
				reader.read(8);
				break;
			default:
				return undefined;
		}
	}

	return text;
}

/** Reads a sampled grid for a known version. Returns undefined if it is not a valid code. */
export function readSymbol(
	modules: Uint8Array,
	version: number,
): QrReading | undefined {
	const size = sizeOfVersion(version);
	const format = readFormat(modules, size);

	if (!format) return undefined;

	const layout = createLayout(version);
	const order = dataModuleOrder(layout);
	const stream = new Uint8Array(rawCodewords(version));

	for (let i = 0; i < stream.length * 8; i++) {
		const index = order[i]!;
		const bit =
			modules[index]! ^
			(maskFlips(format.mask, index % size, Math.floor(index / size)) ? 1 : 0);

		stream[i >>> 3]! |= bit << (7 - (i & 7));
	}

	const data = correctBlocks(stream, version, format.ecc);

	if (!data) return undefined;

	const text = parseSegments(data, version);

	return text === undefined ? undefined : { text, version, ecc: format.ecc };
}

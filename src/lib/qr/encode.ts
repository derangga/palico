import { Effect } from "effect";

import { QrCapacityError } from "./errors.ts";
import {
	createLayout,
	dataModuleOrder,
	formatCodeword,
	formatPositions,
	maskFlips,
} from "./layout.ts";
import { rsEncode } from "./reed-solomon.ts";
import {
	ALPHANUMERIC_CHARS,
	blockCount,
	countBits,
	dataCodewords,
	type EccLevel,
	eccCodewordsPerBlock,
	maxCharacters,
	MAX_VERSION,
	MODE_INDICATOR,
	MODE_UNIT,
	type QrMode,
	rawCodewords,
	smallestVersion,
} from "./tables.ts";

export interface QrCode {
	readonly version: number;
	readonly ecc: EccLevel;
	readonly mask: number;
	/** Modules per side, not counting the quiet zone. */
	readonly size: number;
	/** Row-major, 1 is a dark module. */
	readonly modules: Uint8Array;
}

/** What a piece of text needs: the densest mode that can hold all of it. */
export interface Payload {
	readonly mode: QrMode;
	/** Characters in numeric and alphanumeric mode, UTF-8 bytes in byte mode. */
	readonly length: number;
	readonly bytes: Uint8Array;
}

const textEncoder = new TextEncoder();

export function classify(text: string): Payload {
	const bytes = textEncoder.encode(text);

	if (/^[0-9]+$/.test(text)) {
		return { mode: "numeric", length: text.length, bytes };
	}

	if ([...text].every((char) => ALPHANUMERIC_CHARS.includes(char))) {
		return { mode: "alphanumeric", length: text.length, bytes };
	}

	return { mode: "byte", length: bytes.length, bytes };
}

/** The smallest version that fits the text at this level, or undefined when none does. */
export function versionFor(text: string, ecc: EccLevel): number | undefined {
	const payload = classify(text);

	return smallestVersion(payload.mode, payload.length, ecc);
}

class BitBuffer {
	readonly bits: number[] = [];

	append(value: number, length: number) {
		for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
	}
}

function writePayload(buffer: BitBuffer, text: string, payload: Payload) {
	switch (payload.mode) {
		case "numeric":
			for (let i = 0; i < text.length; i += 3) {
				const chunk = text.slice(i, i + 3);

				buffer.append(Number(chunk), chunk.length * 3 + 1);
			}

			break;
		case "alphanumeric":
			for (let i = 0; i < text.length; i += 2) {
				const first = ALPHANUMERIC_CHARS.indexOf(text[i]!);

				if (i + 1 < text.length) {
					buffer.append(
						first * 45 + ALPHANUMERIC_CHARS.indexOf(text[i + 1]!),
						11,
					);
				} else {
					buffer.append(first, 6);
				}
			}

			break;
		case "byte":
			for (const byte of payload.bytes) buffer.append(byte, 8);
	}
}

function toCodewords(
	text: string,
	payload: Payload,
	version: number,
	ecc: EccLevel,
): Uint8Array {
	const buffer = new BitBuffer();
	const capacityBits = dataCodewords(version, ecc) * 8;

	buffer.append(MODE_INDICATOR[payload.mode], 4);
	buffer.append(payload.length, countBits(payload.mode, version));
	writePayload(buffer, text, payload);

	buffer.append(0, Math.min(4, capacityBits - buffer.bits.length));
	buffer.append(0, (8 - (buffer.bits.length % 8)) % 8);

	for (let pad = 0xec; buffer.bits.length < capacityBits; pad ^= 0xec ^ 0x11) {
		buffer.append(pad, 8);
	}

	const data = new Uint8Array(buffer.bits.length / 8);

	buffer.bits.forEach((bit, i) => {
		data[i >>> 3]! |= bit << (7 - (i & 7));
	});

	return data;
}

// Split the data into blocks, add each block's check bytes, then interleave
// the blocks byte by byte (data first, then check bytes).
function interleave(
	data: Uint8Array,
	version: number,
	ecc: EccLevel,
): Uint8Array {
	const blocks = blockCount(version, ecc);
	const eccLength = eccCodewordsPerBlock(version, ecc);
	const total = rawCodewords(version);
	const shortBlocks = blocks - (total % blocks);
	const shortLength = Math.floor(total / blocks);

	const dataBlocks: Uint8Array[] = [];
	const eccBlocks: Uint8Array[] = [];
	let offset = 0;

	for (let i = 0; i < blocks; i++) {
		const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1);
		const block = data.subarray(offset, offset + length);

		dataBlocks.push(block);
		eccBlocks.push(rsEncode(Array.from(block), eccLength));
		offset += length;
	}

	const result: number[] = [];
	const longestData = shortLength - eccLength + 1;

	for (let i = 0; i < longestData; i++) {
		for (const block of dataBlocks) {
			if (i < block.length) result.push(block[i]!);
		}
	}

	for (let i = 0; i < eccLength; i++) {
		for (const block of eccBlocks) result.push(block[i]!);
	}

	return Uint8Array.from(result);
}

// Penalty score from the spec: runs, 2x2 blocks, finder-like runs and balance.
function penalty(modules: Uint8Array, size: number): number {
	let score = 0;
	const at = (x: number, y: number) => modules[y * size + x]!;

	const scoreLine = (get: (i: number) => number) => {
		let run = 1;
		let history = 0;

		for (let i = 0; i < size; i++) {
			if (i > 0 && get(i) === get(i - 1)) {
				run++;
			} else {
				if (run >= 5) score += 3 + (run - 5);

				run = 1;
			}

			// The last 11 modules as bits, to spot 1011101 with 4 light modules beside it.
			history = ((history << 1) | get(i)) & 0x7ff;

			if (i >= 10 && (history === 0b10111010000 || history === 0b00001011101)) {
				score += 40;
			}
		}

		if (run >= 5) score += 3 + (run - 5);
	};

	for (let i = 0; i < size; i++) {
		scoreLine((x) => at(x, i));
		scoreLine((y) => at(i, y));
	}

	for (let y = 0; y < size - 1; y++) {
		for (let x = 0; x < size - 1; x++) {
			const value = at(x, y);

			if (
				value === at(x + 1, y) &&
				value === at(x, y + 1) &&
				value === at(x + 1, y + 1)
			) {
				score += 3;
			}
		}
	}

	let dark = 0;

	for (const module of modules) dark += module;

	const total = size * size;

	score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;

	return score;
}

function build(
	text: string,
	payload: Payload,
	version: number,
	ecc: EccLevel,
): QrCode {
	const layout = createLayout(version);
	const { size, isFunction } = layout;

	const codewords = interleave(
		toCodewords(text, payload, version, ecc),
		version,
		ecc,
	);

	const order = dataModuleOrder(layout);
	const base = layout.modules.slice();

	order.forEach((index, i) => {
		base[index] = (codewords[i >>> 3]! >>> (7 - (i & 7))) & 1;
	});

	const withMask = (mask: number): Uint8Array => {
		const modules = base.slice();

		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const index = y * size + x;

				if (isFunction[index] === 0 && maskFlips(mask, x, y))
					modules[index]! ^= 1;
			}
		}

		const word = formatCodeword(ecc, mask);

		for (const copy of formatPositions(size)) {
			copy.forEach(([x, y], bit) => {
				modules[y * size + x] = (word >>> bit) & 1;
			});
		}

		return modules;
	};

	let best = { mask: 0, modules: withMask(0), score: Infinity };

	for (let mask = 0; mask < 8; mask++) {
		const modules = withMask(mask);
		const score = penalty(modules, size);

		if (score < best.score) best = { mask, modules, score };
	}

	return { version, ecc, mask: best.mask, size, modules: best.modules };
}

/** Encodes text into a QR symbol. Fails when the text is too long for any version. */
export const encodeQr = (
	text: string,
	ecc: EccLevel,
): Effect.Effect<QrCode, QrCapacityError> =>
	Effect.suspend(() => {
		const payload = classify(text);
		const version = smallestVersion(payload.mode, payload.length, ecc);

		if (version === undefined) {
			const limit = maxCharacters(payload.mode, MAX_VERSION, ecc);

			return Effect.fail(
				new QrCapacityError({
					length: payload.length,
					limit,
					message: `That is too long for a QR code at this error correction level. The most it holds is ${limit.toLocaleString("en-US")} ${MODE_UNIT[payload.mode]}.`,
				}),
			);
		}

		return Effect.succeed(build(text, payload, version, ecc));
	});

/** Like `encodeQr` without the Effect wrapper, for tests and the decoder's checks. */
export function encodeQrSync(text: string, ecc: EccLevel): QrCode | undefined {
	const payload = classify(text);
	const version = smallestVersion(payload.mode, payload.length, ecc);

	return version === undefined ? undefined : build(text, payload, version, ecc);
}

// Reads bytes as UTF-8 without losing the ones that are not. `TextDecoder` turns
// every bad byte into U+FFFD, so the claim would read as a replacement mark and
// the original byte would be gone. Here each bad byte becomes a private-use
// character that carries the byte, and `showInvalidBytes` writes those as `\xHH`
// once the text has been through the JSON reader and writer.

const SENTINEL_BASE = 0xf700;
const SENTINELS = /[-]/g;

const CONTINUATION_MASK = 0xc0;
const CONTINUATION = 0x80;

// How long a sequence is, the smallest code point it may encode (anything lower is
// an overlong form) and the lead byte's own bits. `undefined` is not a lead byte.
function lead(byte: number) {
	if (byte >= 0xc2 && byte <= 0xdf) {
		return { length: 2, min: 0x80, bits: byte & 0x1f };
	}

	if (byte >= 0xe0 && byte <= 0xef) {
		return { length: 3, min: 0x800, bits: byte & 0x0f };
	}

	if (byte >= 0xf0 && byte <= 0xf4) {
		return { length: 4, min: 0x10000, bits: byte & 0x07 };
	}

	return undefined;
}

/** The length of the valid sequence at `at`, or 0 when the byte there is not valid UTF-8. */
function sequenceLength(bytes: Uint8Array, at: number): number {
	const first = bytes[at] ?? 0;

	if (first < 0x80) return 1;

	const start = lead(first);

	if (!start) return 0;

	let point = start.bits;

	for (let offset = 1; offset < start.length; offset += 1) {
		const next = bytes[at + offset];

		if (next === undefined || (next & CONTINUATION_MASK) !== CONTINUATION) {
			return 0;
		}

		point = (point << 6) | (next & 0x3f);
	}

	const surrogate = point >= 0xd800 && point <= 0xdfff;

	return point < start.min || point > 0x10ffff || surrogate ? 0 : start.length;
}

const STRICT = new TextDecoder("utf-8", { fatal: true });
const LENIENT = new TextDecoder("utf-8");

const decodeStrict = (bytes: Uint8Array): string | undefined => {
	try {
		return STRICT.decode(bytes);
	} catch {
		return undefined;
	}
};

/** Decodes UTF-8. Each invalid byte becomes a marker that `showInvalidBytes` can write out. */
export function decodeUtf8(bytes: Uint8Array): string {
	const clean = decodeStrict(bytes);

	if (clean !== undefined) return clean;

	let text = "";
	let at = 0;

	while (at < bytes.length) {
		const length = sequenceLength(bytes, at);

		if (length === 0) {
			text += String.fromCharCode(SENTINEL_BASE + (bytes[at] ?? 0));
			at += 1;
		} else {
			text += LENIENT.decode(bytes.subarray(at, at + length));
			at += length;
		}
	}

	return text;
}

/** Writes each invalid-byte marker as `\xHH`. */
export const showInvalidBytes = (text: string): string =>
	text.replace(SENTINELS, (marker) => {
		const byte = marker.charCodeAt(0) - SENTINEL_BASE;

		return `\\x${byte.toString(16).toUpperCase().padStart(2, "0")}`;
	});

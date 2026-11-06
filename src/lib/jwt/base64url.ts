// Base64url as JWTs write it: `-` and `_` instead of `+` and `/`, and usually no
// padding. Trailing `=` is accepted because some tools add it.

export type Base64UrlResult =
	| { readonly kind: "bytes"; readonly bytes: Uint8Array<ArrayBuffer> }
	| { readonly kind: "bad-char"; readonly index: number; readonly char: string }
	| { readonly kind: "bad-length" };

// The u flag makes an emoji one character, not half of a surrogate pair.
const OUTSIDE_ALPHABET = /[^A-Za-z0-9_-]/u;
const PADDING = /={0,2}$/;

/** Decodes Base64url text. Reports the first character it cannot read. */
export function decodeBase64Url(text: string): Base64UrlResult {
	const unpadded = text.replace(PADDING, "");
	const bad = OUTSIDE_ALPHABET.exec(unpadded);

	if (bad) {
		return { kind: "bad-char", index: bad.index, char: bad[0] };
	}

	// One leftover character carries only six bits, which is not a whole byte.
	if (unpadded.length % 4 === 1) return { kind: "bad-length" };

	const standard = unpadded.replaceAll("-", "+").replaceAll("_", "/");
	const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);

	for (let at = 0; at < binary.length; at += 1) {
		bytes[at] = binary.charCodeAt(at);
	}

	return { kind: "bytes", bytes };
}

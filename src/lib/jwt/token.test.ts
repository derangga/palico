import { describe, expect, it } from "vitest";

import { EXAMPLE_TOKEN } from "./example.ts";
import { assemble, base64url, decode, decodeFailure } from "./test-helpers.ts";
import { MAX_TOKEN_CHARS, readToken, splitParts, tidyToken } from "./token.ts";

// The jwt.io sample, written by a different implementation than ours.
const SAMPLE =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

describe("a good token", () => {
	it("reads the header, payload and signature", () => {
		const token = decode(SAMPLE);

		expect(token.header).toEqual({ alg: "HS256", typ: "JWT" });
		expect(token.payload).toEqual({
			sub: "1234567890",
			name: "John Doe",
			iat: 1516239022,
		});
		expect(token.alg).toBe("HS256");
		expect(token.signature.length).toBe(32);
	});

	it("keeps the signing input exactly as written", () => {
		const [header, payload] = SAMPLE.split(".");

		expect(decode(SAMPLE).signingInput).toBe(`${header}.${payload}`);
	});

	it("pretty-prints the header and payload", () => {
		expect(decode(SAMPLE).headerText).toBe(
			'{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
		);
	});

	it("reads the example token", () => {
		expect(decode(EXAMPLE_TOKEN).alg).toBe("HS256");
	});

	it("reads the kid when the header has one", () => {
		const token = decode(assemble('{"alg":"RS256","kid":"key-1"}', "{}", "AA"));

		expect(token.kid).toBe("key-1");
	});
});

describe("pasting around the token", () => {
	it("takes off a Bearer prefix, an Authorization header, quotes and line breaks", () => {
		expect(tidyToken(`Bearer ${SAMPLE}`)).toBe(SAMPLE);
		expect(tidyToken(`Authorization: Bearer ${SAMPLE}`)).toBe(SAMPLE);
		expect(tidyToken(`"${SAMPLE}"`)).toBe(SAMPLE);
		expect(tidyToken(`'${SAMPLE}'\n`)).toBe(SAMPLE);
		expect(tidyToken(SAMPLE.replace(".", "\n.\n  "))).toBe(SAMPLE);
	});

	it("decodes a token pasted with a Bearer prefix", () => {
		expect(decode(`  Bearer ${SAMPLE}  `).alg).toBe("HS256");
	});
});

describe("padding", () => {
	it("reads parts with and without = padding", () => {
		const header = base64url('{"alg":"HS256"}');
		const payload = base64url('{"a":1}');

		expect(decode(`${header}.${payload}.`).payload).toEqual({ a: 1 });

		const padded = `${header}${"=".repeat((4 - (header.length % 4)) % 4)}.${payload}${"=".repeat((4 - (payload.length % 4)) % 4)}.`;

		expect(decode(padded).payload).toEqual({ a: 1 });
	});
});

describe("alg none", () => {
	it("reads a token whose signature is empty", () => {
		const token = decode(assemble('{"alg":"none"}', '{"sub":"x"}'));

		expect(token.alg).toBe("none");
		expect(token.signature.length).toBe(0);
	});
});

describe("payloads that are not objects", () => {
	it("reads a JSON array", () => {
		expect(decode(assemble('{"alg":"HS256"}', "[1,2]", "AA")).payload).toEqual([
			1, 2,
		]);
	});

	it("reads a bare string or number", () => {
		expect(decode(assemble('{"alg":"HS256"}', '"hi"', "AA")).payload).toBe(
			"hi",
		);
		expect(decode(assemble('{"alg":"HS256"}', "7", "AA")).payload).toBe(7);
	});
});

describe("claims that are not valid UTF-8", () => {
	it("shows the bad byte as \\xHH and does not drop it", () => {
		const header = base64url('{"alg":"HS256"}');

		const bytes = Buffer.concat([
			Buffer.from('{"name":"caf'),
			Buffer.from([0xe9]),
			Buffer.from('"}'),
		]);

		const token = decode(`${header}.${base64url(bytes)}.AA`);

		expect(token.payloadText).toContain("caf\\xE9");
		expect(token.payloadText).not.toContain("�");
	});
});

describe("bad bytes outside the claims", () => {
	const header = (bytes: ReadonlyArray<number>) =>
		base64url(Buffer.from(bytes));

	it("writes a bad byte inside alg as \\xHH, not as a private-use character", () => {
		const bytes = [...Buffer.from('{"alg":"HS'), 0xff, ...Buffer.from('"}')];
		const token = decode(`${header(bytes)}.${base64url("{}")}.AA`);

		expect(token.alg).toBe("HS\\xFF");
		expect(token.alg).not.toMatch(/[\uf780-\uf7ff]/);
	});

	it("writes a bad byte inside kid the same way", () => {
		const bytes = [
			...Buffer.from('{"alg":"RS256","kid":"k'),
			0x80,
			...Buffer.from('"}'),
		];

		expect(decode(`${header(bytes)}.${base64url("{}")}.AA`).kid).toBe("k\\x80");
	});

	it("keeps the marker out of a JSON error", () => {
		const bytes = [...Buffer.from('{"alg":'), 0xff, ...Buffer.from("}")];
		const error = decodeFailure(`${header(bytes)}.${base64url("{}")}.AA`);

		expect(error.message).not.toMatch(/[\uf780-\uf7ff]/);
		expect(error.message).toContain("\\xFF");
	});

	it("reads a header that starts with a byte order mark", () => {
		const bytes = [0xef, 0xbb, 0xbf, ...Buffer.from('{"alg":"HS256"}')];

		expect(decode(`${header(bytes)}.${base64url("{}")}.AA`).alg).toBe("HS256");
	});
});

describe("big numbers", () => {
	it("writes an integer past 2^53 with its own digits", () => {
		const token = decode(
			assemble('{"alg":"HS256"}', '{"id":12345678901234567890}', "AA"),
		);

		expect(token.payloadText).toContain("12345678901234567890");
	});
});

describe("malformed tokens", () => {
	it("refuses two parts", () => {
		const error = decodeFailure("aaaa.bbbb");

		expect(error._tag).toBe("MalformedTokenError");
		expect(error).toMatchObject({ part: "token" });
		expect(error.message).toContain("2");
	});

	it("refuses four parts", () => {
		expect(decodeFailure("a.b.c.d")._tag).toBe("MalformedTokenError");
	});

	it("says a token with no dots has none", () => {
		expect(decodeFailure("abcdef").message).toMatch(/no dots/);
	});

	it("names a five-part token as encrypted", () => {
		expect(decodeFailure("a.b.c.d.e").message).toMatch(/JWE/);
	});

	it("names the part and the position of a character outside Base64url", () => {
		const error = decodeFailure(`${base64url('{"alg":"x"}')}.ab+d.sig`);

		expect(error).toMatchObject({
			_tag: "MalformedTokenError",
			part: "payload",
		});
		expect(error.message).toContain("position 3");
		expect(error.message).toContain('"+"');
	});

	it("shows an emoji in a Base64url part as one character", () => {
		const error = decodeFailure(`${base64url('{"alg":"x"}')}.ab😀d.sig`);

		expect(error.message).toContain('"😀"');
	});

	it("names a signature that is not Base64url", () => {
		const error = decodeFailure(`${assemble('{"alg":"x"}', "{}")}ab!d`);

		expect(error).toMatchObject({ part: "signature" });
	});
});

describe("invalid JSON", () => {
	it("names the header when it is not JSON", () => {
		const error = decodeFailure(assemble("not json", "{}", "AA"));

		expect(error).toMatchObject({ _tag: "InvalidJsonError", part: "header" });
	});

	it("names the payload when it is not JSON", () => {
		const error = decodeFailure(assemble('{"alg":"HS256"}', "{oops}", "AA"));

		expect(error).toMatchObject({ _tag: "InvalidJsonError", part: "payload" });
	});

	it("refuses a header that is an array or a string", () => {
		expect(decodeFailure(assemble("[1]", "{}", "AA"))).toMatchObject({
			_tag: "InvalidJsonError",
			part: "header",
		});

		expect(decodeFailure(assemble('"HS256"', "{}", "AA"))).toMatchObject({
			part: "header",
		});
	});

	it("refuses an empty header", () => {
		expect(decodeFailure(".e30.AA")).toMatchObject({ part: "header" });
	});
});

describe("size", () => {
	it("refuses a token past the limit", () => {
		const error = decodeFailure("a".repeat(MAX_TOKEN_CHARS + 1));

		expect(error._tag).toBe("TokenTooLargeError");
	});
});

describe("splitParts", () => {
	it("returns three parts or nothing", () => {
		expect(splitParts("a.b.c")).toEqual(["a", "b", "c"]);
		expect(splitParts("a.b.")).toEqual(["a", "b", ""]);
		expect(splitParts("a.b")).toBeUndefined();
		expect(splitParts("a.b.c.d")).toBeUndefined();
	});
});

describe("readToken", () => {
	it("says empty for nothing typed, however much whitespace", () => {
		expect(readToken("")).toEqual({ kind: "empty" });
		expect(readToken("  \n ")).toEqual({ kind: "empty" });
		expect(readToken('Bearer ""')).toEqual({ kind: "empty" });
	});

	it("keeps the parts of a three-part token that fails, so the page can mark the one at fault", () => {
		const reading = readToken(`${base64url('{"alg":"x"}')}.ab+d.sig`);

		expect(reading.kind).toBe("error");

		if (reading.kind === "error") {
			expect(reading.parts?.[1]).toBe("ab+d");
		}
	});

	it("has no parts to mark when there are not three", () => {
		const reading = readToken("a.b");

		expect(reading.kind === "error" && reading.parts).toBeUndefined();
	});

	it("never throws, whatever is pasted", () => {
		const alphabet = "ab-_=.+/ \"'\\{}[]:,0é日\n\u0000\uf7e9Bearer ";
		let seed = 12345;

		const next = () => {
			seed = (seed * 1664525 + 1013904223) % 2 ** 32;

			return seed / 2 ** 32;
		};

		for (let round = 0; round < 3000; round += 1) {
			const length = Math.floor(next() * 40);
			let text = "";

			for (let at = 0; at < length; at += 1) {
				text += alphabet[Math.floor(next() * alphabet.length)];
			}

			expect(() => readToken(text)).not.toThrow();
		}
	});

	it("never throws on parts that are valid Base64url of random bytes", () => {
		let seed = 99;

		const next = () => {
			seed = (seed * 1664525 + 1013904223) % 2 ** 32;

			return seed / 2 ** 32;
		};

		for (let round = 0; round < 500; round += 1) {
			const bytes = () =>
				base64url(
					Uint8Array.from({ length: Math.floor(next() * 30) }, () =>
						Math.floor(next() * 256),
					),
				);

			expect(() => readToken(`${bytes()}.${bytes()}.${bytes()}`)).not.toThrow();
		}
	});
});

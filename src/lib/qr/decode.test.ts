import { describe, expect, it } from "vitest";

import { decodeFrame } from "./decode.ts";
import { encodeQrSync } from "./encode.ts";
import {
	addNoise,
	blur,
	invert,
	perspective,
	placeOnCanvas,
	renderFrame,
	rotate,
	seeded,
} from "./fixtures.ts";
import type { EccLevel } from "./tables.ts";

const URL_TEXT = "https://palico.rangga.site/qr-reader?from=test&n=42";

const make = (text: string, ecc: EccLevel = "M") => encodeQrSync(text, ecc)!;

describe("decodeFrame on clean images", () => {
	const texts = [
		"7",
		"0123456789".repeat(8),
		"HELLO WORLD",
		URL_TEXT,
		"héllo wörld ✓ 日本語 🙂",
		"WIFI:T:WPA;S:Cafe Net;P:secret;;",
		"x".repeat(400),
	];

	for (const ecc of ["L", "M", "Q", "H"] as const) {
		it(`reads every text at level ${ecc}`, () => {
			for (const text of texts) {
				const qr = make(text, ecc);

				const reading = decodeFrame(
					renderFrame(qr, { scale: qr.size > 70 ? 3 : 5 }),
				);

				expect(reading?.text).toBe(text);
			}
		});
	}

	it("reads a code with a thin quiet zone", () => {
		const qr = make(URL_TEXT);

		expect(decodeFrame(renderFrame(qr, { scale: 6, border: 1 }))?.text).toBe(
			URL_TEXT,
		);
	});

	it("reads very large and very small modules", () => {
		const qr = make("HELLO WORLD");

		expect(decodeFrame(renderFrame(qr, { scale: 2 }))?.text).toBe(
			"HELLO WORLD",
		);
		expect(decodeFrame(renderFrame(qr, { scale: 40 }))?.text).toBe(
			"HELLO WORLD",
		);
	});

	it("reports the version and level it read", () => {
		const reading = decodeFrame(renderFrame(make("a".repeat(300), "Q")));

		expect(reading?.ecc).toBe("Q");
		expect(reading?.version).toBe(make("a".repeat(300), "Q").version);
	});
});

describe("decodeFrame on rotated and flipped colour", () => {
	for (const turns of [1, 2, 3]) {
		it(`reads a code turned ${turns * 90} degrees`, () => {
			const frame = rotate(renderFrame(make(URL_TEXT), { scale: 5 }), turns);

			expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
		});
	}

	it("reads light modules on a dark background", () => {
		const frame = invert(renderFrame(make(URL_TEXT), { scale: 5 }));

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});
});

describe("decodeFrame on photo-like damage", () => {
	it("reads low contrast gray on gray", () => {
		const frame = renderFrame(make(URL_TEXT), {
			scale: 5,
			dark: 110,
			light: 190,
		});

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});

	it("reads a small code lost in a big, unevenly lit image", () => {
		const code = renderFrame(make(URL_TEXT), { scale: 4 });
		const frame = placeOnCanvas(code, 1600, 1200, 900, 300, 0.45);

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});

	it("reads thin modules in an image wider than 2000 px", () => {
		// Shrinking this by 2 halves 3 px modules to 1.5 px, which aliases. The
		// decoder has to fall back to the original pixels.
		for (const [width, height] of [
			[2100, 1181],
			[3840, 2160],
		] as const) {
			const code = renderFrame(make(URL_TEXT), { scale: 3 });
			const frame = placeOnCanvas(code, width, height, 700, 300, 0.3);

			expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
		}
	});

	it("reads through sensor noise", () => {
		const frame = addNoise(
			renderFrame(make(URL_TEXT), { scale: 6 }),
			45,
			seeded(7),
		);

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});

	it("reads through a soft lens", () => {
		const frame = blur(renderFrame(make(URL_TEXT), { scale: 6 }), 3);

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});

	it("reads a code photographed at an angle", () => {
		const code = renderFrame(make(URL_TEXT), { scale: 8 });

		const frame = perspective(code, 700, 600, [
			[90, 60],
			[610, 110],
			[570, 520],
			[60, 470],
		]);

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});

	it("reads a large code at a steeper angle using its alignment pattern", () => {
		const text = "https://example.com/a/long/path/".repeat(8);
		const code = renderFrame(make(text, "L"), { scale: 6 });

		const frame = perspective(code, 1100, 1000, [
			[140, 90],
			[960, 190],
			[880, 880],
			[90, 790],
		]);

		expect(decodeFrame(frame)?.text).toBe(text);
	});

	it("reads a code that is rotated, noisy and dim together", () => {
		const base = renderFrame(make(URL_TEXT), {
			scale: 6,
			dark: 70,
			light: 210,
		});

		const frame = addNoise(rotate(base, 1), 25, seeded(3));

		expect(decodeFrame(frame)?.text).toBe(URL_TEXT);
	});
});

describe("decodeFrame on images without a code", () => {
	it("returns nothing for a blank page", () => {
		const frame = placeOnCanvas(
			renderFrame(make("x"), { scale: 1 }),
			400,
			300,
			0,
			0,
			0,
		);

		const blank = {
			...frame,
			data: new Uint8ClampedArray(frame.data.length).fill(255),
		};

		expect(decodeFrame(blank)).toBeUndefined();
	});

	it("returns nothing for random noise", () => {
		const random = seeded(99);
		const data = new Uint8ClampedArray(300 * 300 * 4);

		for (let i = 0; i < data.length; i += 4) {
			data[i] = data[i + 1] = data[i + 2] = random() * 255;
			data[i + 3] = 255;
		}

		expect(decodeFrame({ width: 300, height: 300, data })).toBeUndefined();
	});

	it("returns nothing when the code is wrecked beyond repair", () => {
		const qr = make(URL_TEXT, "L");
		const wrecked = { ...qr, modules: qr.modules.slice() };
		const random = seeded(5);

		for (let i = 0; i < wrecked.modules.length; i++) {
			// Leave the corner squares, scramble the rest.
			const x = i % qr.size;
			const y = Math.floor(i / qr.size);

			const corner =
				(x < 9 && y < 9) ||
				(x > qr.size - 9 && y < 9) ||
				(x < 9 && y > qr.size - 9);

			if (!corner && random() < 0.5)
				wrecked.modules[i] = random() < 0.5 ? 1 : 0;
		}

		expect(decodeFrame(renderFrame(wrecked, { scale: 5 }))).toBeUndefined();
	});

	it("handles a frame too small to hold a code", () => {
		expect(
			decodeFrame({ width: 4, height: 4, data: new Uint8ClampedArray(64) }),
		).toBeUndefined();
	});
});

describe("decodeFrame effort", () => {
	it("quick still reads an ordinary camera frame", () => {
		const frame = addNoise(
			renderFrame(make(URL_TEXT), { scale: 5 }),
			20,
			seeded(11),
		);

		expect(decodeFrame(frame, "quick")?.text).toBe(URL_TEXT);
	});
});

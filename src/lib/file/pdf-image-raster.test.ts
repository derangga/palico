import { describe, expect, it } from "vitest";

import {
	expectedInflatedBytes,
	type ImageFacts,
	MAX_IMAGE_PIXELS,
	planImage,
	rowBytes,
	toRgba,
	unpredict,
} from "./pdf-image-raster.ts";

const facts = (over: Partial<ImageFacts> = {}): ImageFacts => ({
	width: 400,
	height: 300,
	bitsPerComponent: 8,
	imageMask: false,
	hasDecode: false,
	hasColorKeyMask: false,
	hasMatte: false,
	filters: ["DCTDecode"],
	colorSpace: { family: "DeviceRGB" },
	predictor: undefined,
	predictorColors: undefined,
	predictorBitsPerComponent: undefined,
	predictorColumns: undefined,
	encodedBytes: 50_000,
	...over,
});

describe("planImage", () => {
	it("takes 8-bit RGB and gray JPEGs", () => {
		expect(planImage(facts())).toEqual({ kind: "jpeg", channels: 3 });
		expect(planImage(facts({ colorSpace: { family: "DeviceGray" } }))).toEqual({
			kind: "jpeg",
			channels: 1,
		});
	});

	it("takes 8-bit gray and RGB Flate images", () => {
		expect(planImage(facts({ filters: ["FlateDecode"] }))).toEqual({
			kind: "flate",
			channels: 3,
		});
		expect(
			planImage(
				facts({
					filters: ["FlateDecode"],
					colorSpace: { family: "DeviceGray" },
				}),
			),
		).toEqual({ kind: "flate", channels: 1 });
	});

	it("takes RGB spaces that keep their own colour space after the re-encode", () => {
		expect(
			planImage(facts({ colorSpace: { family: "ICCBased", components: 3 } })),
		).toEqual({ kind: "jpeg", channels: 3 });
		expect(planImage(facts({ colorSpace: { family: "CalRGB" } }))).toEqual({
			kind: "jpeg",
			channels: 3,
		});
	});

	it("skips grays that have a tone curve, for JPEG and Flate alike", () => {
		// Relabelling these DeviceRGB would shift how the grays look.
		for (const filters of [["DCTDecode"], ["FlateDecode"]]) {
			for (const colorSpace of [
				{ family: "ICCBased", components: 1 },
				{ family: "CalGray" },
			] as const) {
				expect(planImage(facts({ filters, colorSpace }))).toEqual({
					kind: "skip",
					reason: "color-space",
				});
			}
		}
	});

	it.each([
		[
			"ICC with four components",
			{ colorSpace: { family: "ICCBased", components: 4 } },
			"color-space",
		],
		[
			"ICC with unknown components",
			{ colorSpace: { family: "ICCBased", components: undefined } },
			"color-space",
		],
		["CMYK", { colorSpace: { family: "DeviceCMYK" } }, "color-space"],
		["Indexed", { colorSpace: { family: "Indexed" } }, "color-space"],
		["Lab", { colorSpace: { family: "Lab" } }, "color-space"],
		["an image mask", { imageMask: true }, "image-mask"],
		["a Decode array", { hasDecode: true }, "decode-array"],
		["a colour-key mask", { hasColorKeyMask: true }, "color-key-mask"],
		["a soft mask with Matte", { hasMatte: true }, "matte"],
		["JBIG2", { filters: ["JBIG2Decode"] }, "filter"],
		["JPX", { filters: ["JPXDecode"] }, "filter"],
		["CCITT", { filters: ["CCITTFaxDecode"] }, "filter"],
		["a filter chain", { filters: ["ASCII85Decode", "FlateDecode"] }, "filter"],
		["no filter", { filters: [] }, "filter"],
		[
			"16-bit Flate",
			{ filters: ["FlateDecode"], bitsPerComponent: 16 },
			"bits",
		],
		["1-bit Flate", { filters: ["FlateDecode"], bitsPerComponent: 1 }, "bits"],
		["a huge image", { width: MAX_IMAGE_PIXELS, height: 2 }, "too-large"],
		["a tiny stream", { encodedBytes: 500 }, "too-small"],
		["no dimensions", { width: 0 }, "unreadable"],
	] as const)("skips %s", (_label, over, reason) => {
		expect(planImage(facts(over))).toEqual({ kind: "skip", reason });
	});
});

// The forward PNG filters, written out here so unpredict is checked against an
// independent implementation of the spec.
const paethRef = (a: number, b: number, c: number) => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);

	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const pngEncode = (
	pixels: Uint8Array,
	columns: number,
	bpp: number,
	filterFor: (row: number) => number,
): Uint8Array => {
	const stride = columns * bpp;
	const rows = pixels.length / stride;
	const out = new Uint8Array(rows * (stride + 1));

	for (let r = 0; r < rows; r++) {
		const f = filterFor(r);
		out[r * (stride + 1)] = f;

		for (let i = 0; i < stride; i++) {
			const x = pixels[r * stride + i];
			const a = i >= bpp ? pixels[r * stride + i - bpp] : 0;
			const b = r > 0 ? pixels[(r - 1) * stride + i] : 0;
			const c = r > 0 && i >= bpp ? pixels[(r - 1) * stride + i - bpp] : 0;
			const predicted = [0, a, b, (a + b) >> 1, paethRef(a, b, c)][f];
			out[r * (stride + 1) + 1 + i] = (x - predicted) & 0xff;
		}
	}

	return out;
};

// Deterministic noise with some structure, so every filter has work to do.
const noise = (length: number) => {
	const out = new Uint8Array(length);
	let seed = 7;

	for (let i = 0; i < length; i++) {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		out[i] = (seed >> 16) & 0xff;
	}

	return out;
};

describe("unpredict", () => {
	const columns = 9;
	const rows = 7;

	it("returns the data untouched with no predictor or predictor 1", () => {
		const data = noise(30);
		const base = { colors: 3, bitsPerComponent: 8, columns };

		expect(unpredict(data, { ...base, predictor: undefined })).toBe(data);
		expect(unpredict(data, { ...base, predictor: 1 })).toBe(data);
	});

	it.each([
		[0, "None"],
		[1, "Sub"],
		[2, "Up"],
		[3, "Average"],
		[4, "Paeth"],
	])("undoes PNG filter %i (%s) for RGB", (filter) => {
		const pixels = noise(columns * rows * 3);
		const encoded = pngEncode(pixels, columns, 3, () => filter);

		expect(
			unpredict(encoded, {
				predictor: 15,
				colors: 3,
				bitsPerComponent: 8,
				columns,
			}),
		).toEqual(pixels);
	});

	it("undoes a different PNG filter on every row, for gray", () => {
		const pixels = noise(columns * rows);
		const encoded = pngEncode(pixels, columns, 1, (r) => r % 5);

		expect(
			unpredict(encoded, {
				predictor: 10,
				colors: 1,
				bitsPerComponent: 8,
				columns,
			}),
		).toEqual(pixels);
	});

	it("reads the filter from each row, whatever the predictor value says", () => {
		const pixels = noise(columns * rows * 3);
		const encoded = pngEncode(pixels, columns, 3, (r) => (r + 2) % 5);

		for (const predictor of [10, 11, 12, 13, 14, 15]) {
			expect(
				unpredict(encoded, {
					predictor,
					colors: 3,
					bitsPerComponent: 8,
					columns,
				}),
			).toEqual(pixels);
		}
	});

	it("undoes the TIFF predictor on 8-bit RGB", () => {
		const pixels = noise(columns * rows * 3);
		const stride = columns * 3;
		const encoded = new Uint8Array(pixels.length);

		for (let r = 0; r < rows; r++) {
			for (let i = 0; i < stride; i++) {
				const left = i >= 3 ? pixels[r * stride + i - 3] : 0;
				encoded[r * stride + i] = (pixels[r * stride + i] - left) & 0xff;
			}
		}

		expect(
			unpredict(encoded, {
				predictor: 2,
				colors: 3,
				bitsPerComponent: 8,
				columns,
			}),
		).toEqual(pixels);
	});

	it("refuses what it cannot undo exactly", () => {
		const data = noise(40);

		// TIFF at 16 bits, an unknown predictor, an unknown PNG filter byte.
		expect(
			unpredict(data, {
				predictor: 2,
				colors: 1,
				bitsPerComponent: 16,
				columns,
			}),
		).toBeNull();
		expect(
			unpredict(data, {
				predictor: 7,
				colors: 1,
				bitsPerComponent: 8,
				columns,
			}),
		).toBeNull();

		const bad = new Uint8Array(columns + 1);
		bad[0] = 9;
		expect(
			unpredict(bad, {
				predictor: 15,
				colors: 1,
				bitsPerComponent: 8,
				columns,
			}),
		).toBeNull();
	});

	it("computes the stride of a row", () => {
		expect(rowBytes(9, 3, 8)).toBe(27);
		expect(rowBytes(9, 1, 1)).toBe(2);
	});
});

describe("expectedInflatedBytes", () => {
	const flate = (over: Partial<ImageFacts> = {}) =>
		facts({ filters: ["FlateDecode"], width: 10, height: 4, ...over });

	it("is the raw sample count with no predictor", () => {
		expect(expectedInflatedBytes(flate(), 3)).toBe(10 * 4 * 3);
		expect(expectedInflatedBytes(flate({ predictor: 1 }), 1)).toBe(10 * 4);
	});

	it("adds a filter byte per row for PNG predictors", () => {
		expect(
			expectedInflatedBytes(
				flate({
					predictor: 15,
					predictorColors: 3,
					predictorBitsPerComponent: 8,
					predictorColumns: 10,
				}),
				3,
			),
		).toBe(4 * (10 * 3 + 1));
	});

	it("has no filter byte for the TIFF predictor", () => {
		expect(
			expectedInflatedBytes(
				flate({ predictor: 2, predictorColors: 1, predictorColumns: 10 }),
				1,
			),
		).toBe(4 * 10);
	});

	it("refuses predictor parameters that do not describe the image", () => {
		const base = {
			predictor: 15,
			predictorColors: 3,
			predictorBitsPerComponent: 8,
			predictorColumns: 10,
		};

		expect(
			expectedInflatedBytes(flate({ ...base, predictorColumns: 9 }), 3),
		).toBeNull();
		expect(
			expectedInflatedBytes(flate({ ...base, predictorColors: 1 }), 3),
		).toBeNull();
		expect(
			expectedInflatedBytes(
				flate({ ...base, predictorBitsPerComponent: 16 }),
				3,
			),
		).toBeNull();
		expect(
			expectedInflatedBytes(flate({ ...base, predictor: 5 }), 3),
		).toBeNull();
		expect(
			expectedInflatedBytes(flate({ ...base, predictor: 16 }), 3),
		).toBeNull();
	});
});

describe("toRgba", () => {
	it("expands gray to opaque RGBA", () => {
		expect(Array.from(toRgba(Uint8Array.of(10, 200), 2, 1, 1) ?? [])).toEqual([
			10, 10, 10, 255, 200, 200, 200, 255,
		]);
	});

	it("expands RGB to opaque RGBA", () => {
		expect(
			Array.from(toRgba(Uint8Array.of(1, 2, 3, 4, 5, 6), 2, 1, 3) ?? []),
		).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
	});

	it("returns null when the samples are short", () => {
		expect(toRgba(Uint8Array.of(1, 2, 3), 2, 1, 3)).toBeNull();
	});
});

// Pure byte-level helpers for the PDF compressor's image pass: deciding which
// image XObjects are safe to re-encode, undoing PDF predictors on inflated
// data, and expanding raw pixels to RGBA. Imported by the PDF worker, so this
// module must stay free of Effect, pdf-lib and DOM imports.

// A decoded image costs 4 bytes a pixel as RGBA, plus the inflated samples
// beside it while it is built. Past 20 megapixels the pass leaves the image
// alone rather than risk the worker running out of memory.
export const MAX_IMAGE_PIXELS = 20_000_000;

// Re-encoding a tiny image costs a decode and an encode for a few hundred bytes
// at best (icons, bullets, rules), so the pass does not try.
export const MIN_IMAGE_BYTES = 8 * 1024;

export type ColorSpaceFacts =
	| {
			readonly family:
				| "DeviceGray"
				| "DeviceRGB"
				| "CalGray"
				| "CalRGB"
				| "DeviceCMYK"
				| "Indexed"
				| "Lab"
				| "Separation"
				| "DeviceN"
				| "Pattern"
				| "Unknown";
	  }
	| { readonly family: "ICCBased"; readonly components: number | undefined };

// What the walker read from an image's dictionary. Plain data, so the decision
// below is testable without a PDF.
export interface ImageFacts {
	readonly width: number;
	readonly height: number;
	readonly bitsPerComponent: number | undefined;
	readonly imageMask: boolean;
	readonly hasDecode: boolean;
	// /Mask is an array of colour ranges. A lossy re-encode would break the key.
	readonly hasColorKeyMask: boolean;
	// The soft mask has a /Matte, so the colour is pre-blended with the alpha.
	readonly hasMatte: boolean;
	readonly filters: ReadonlyArray<string>;
	readonly colorSpace: ColorSpaceFacts;
	readonly predictor: number | undefined;
	readonly predictorColors: number | undefined;
	readonly predictorBitsPerComponent: number | undefined;
	readonly predictorColumns: number | undefined;
	// Encoded size of the stream, in bytes.
	readonly encodedBytes: number;
}

export type SkipReason =
	| "image-mask"
	| "decode-array"
	| "color-key-mask"
	| "matte"
	| "used-as-mask"
	| "filter"
	| "color-space"
	| "bits"
	| "too-large"
	| "too-small"
	| "unreadable";

export type ImagePlan =
	| {
			readonly kind: "jpeg" | "flate";
			// Components per pixel in the source: 1 (gray) or 3 (RGB).
			readonly channels: 1 | 3;
	  }
	| { readonly kind: "skip"; readonly reason: SkipReason };

const skip = (reason: SkipReason): ImagePlan => ({ kind: "skip", reason });

// Only colour spaces that survive a re-encode unchanged are taken.
// - DeviceGray becomes an RGB JPEG with r = g = b and the image is relabelled
//   DeviceRGB. A device space has no tone curve of its own, so nothing shifts.
// - A calibrated or profiled gray (CalGray, ICCBased with one component) has a
//   tone curve. Relabelling it DeviceRGB would change how the grays look, so it
//   is skipped. Gray JPEGs follow the same rule.
// - RGB keeps its colour space as it is, so DeviceRGB, CalRGB and ICCBased with
//   three components are all fine.
// CMYK, Indexed, Lab and spot colours are left alone.
export const channelsOf = (colorSpace: ColorSpaceFacts): 1 | 3 | undefined => {
	switch (colorSpace.family) {
		case "DeviceGray":
			return 1;
		case "DeviceRGB":
		case "CalRGB":
			return 3;
		case "ICCBased":
			return colorSpace.components === 3 ? 3 : undefined;
		default:
			return undefined;
	}
};

export const planImage = (facts: ImageFacts): ImagePlan => {
	if (facts.imageMask) return skip("image-mask");

	if (facts.hasDecode) return skip("decode-array");

	if (facts.hasColorKeyMask) return skip("color-key-mask");

	if (facts.hasMatte) return skip("matte");

	if (facts.width < 1 || facts.height < 1) return skip("unreadable");

	if (facts.width * facts.height > MAX_IMAGE_PIXELS) return skip("too-large");

	if (facts.encodedBytes < MIN_IMAGE_BYTES) return skip("too-small");

	// One filter only: a chain such as ASCII85 then Flate, or Flate then DCT,
	// would need more decoders than this pass carries.
	if (facts.filters.length !== 1) return skip("filter");

	const [filter] = facts.filters;

	if (filter !== "DCTDecode" && filter !== "FlateDecode") return skip("filter");

	const channels = channelsOf(facts.colorSpace);

	if (channels === undefined) return skip("color-space");

	// A JPEG is always 8 bits per sample. Raw samples must be 8-bit too.
	if (filter === "FlateDecode" && facts.bitsPerComponent !== 8) {
		return skip("bits");
	}

	return { kind: filter === "DCTDecode" ? "jpeg" : "flate", channels };
};

// --- Predictors --------------------------------------------------------------

export interface PredictorParams {
	readonly predictor: number | undefined;
	readonly colors: number;
	readonly bitsPerComponent: number;
	readonly columns: number;
}

const paeth = (a: number, b: number, c: number): number => {
	const p = a + b - c;
	const pa = Math.abs(p - a);
	const pb = Math.abs(p - b);
	const pc = Math.abs(p - c);

	if (pa <= pb && pa <= pc) return a;

	return pb <= pc ? b : c;
};

// Bytes in one row of samples, without the PNG filter byte.
export const rowBytes = (
	columns: number,
	colors: number,
	bitsPerComponent: number,
): number => Math.ceil((columns * colors * bitsPerComponent) / 8);

// Undo the /Predictor of a FlateDecode stream on already inflated data.
//   1 or none  no prediction, the data is returned as is.
//   2          TIFF: each sample is a difference from the one before it (8-bit).
//   10 to 15   PNG: every row starts with its own filter byte, and the value
//              of /Predictor itself does not matter.
// Returns null for anything it cannot undo exactly, so the caller skips the
// image instead of encoding garbage.
export const unpredict = (
	data: Uint8Array,
	params: PredictorParams,
): Uint8Array | null => {
	const { predictor, colors, bitsPerComponent, columns } = params;

	if (predictor === undefined || predictor === 1) return data;

	const stride = rowBytes(columns, colors, bitsPerComponent);

	if (stride === 0) return null;

	if (predictor === 2) {
		if (bitsPerComponent !== 8) return null;

		const rows = Math.floor(data.length / stride);
		const out = new Uint8Array(rows * stride);

		for (let r = 0; r < rows; r++) {
			const base = r * stride;

			for (let i = 0; i < stride; i++) {
				const left = i >= colors ? out[base + i - colors] : 0;
				out[base + i] = (data[base + i] + left) & 0xff;
			}
		}

		return out;
	}

	if (predictor < 10 || predictor > 15) return null;

	// Bytes per complete pixel, at least one: the "left" neighbour of PNG.
	const bpp = Math.max(1, Math.ceil((colors * bitsPerComponent) / 8));
	const rows = Math.floor(data.length / (stride + 1));
	const out = new Uint8Array(rows * stride);

	for (let r = 0; r < rows; r++) {
		const src = r * (stride + 1);
		const filter = data[src];
		const dst = r * stride;
		const prev = dst - stride;

		for (let i = 0; i < stride; i++) {
			const raw = data[src + 1 + i];
			const left = i >= bpp ? out[dst + i - bpp] : 0;
			const up = r > 0 ? out[prev + i] : 0;
			const upLeft = r > 0 && i >= bpp ? out[prev + i - bpp] : 0;
			let value: number;

			switch (filter) {
				case 0:
					value = raw;
					break;
				case 1:
					value = raw + left;
					break;
				case 2:
					value = raw + up;
					break;
				case 3:
					value = raw + ((left + up) >> 1);
					break;
				case 4:
					value = raw + paeth(left, up, upLeft);
					break;
				default:
					return null;
			}

			out[dst + i] = value & 0xff;
		}
	}

	return out;
};

// Exact length of an image's inflated stream, or null when its predictor
// parameters cannot describe a width x height image of this many channels. The
// inflate is given a buffer of this size, which also caps a decompression bomb.
export const expectedInflatedBytes = (
	facts: ImageFacts,
	channels: 1 | 3,
): number | null => {
	const { width, height, predictor } = facts;

	if (predictor === undefined || predictor === 1) {
		return width * height * channels;
	}

	const colors = facts.predictorColors ?? 1;
	const bitsPerComponent = facts.predictorBitsPerComponent ?? 8;
	const columns = facts.predictorColumns ?? 1;

	// The predicted rows must be exactly the image's rows.
	if (
		bitsPerComponent !== 8 ||
		colors !== channels ||
		columns !== width ||
		predictor < 2 ||
		(predictor > 2 && predictor < 10) ||
		predictor > 15
	) {
		return null;
	}

	const stride = rowBytes(columns, colors, bitsPerComponent);

	return height * (predictor === 2 ? stride : stride + 1);
};

// Expand tightly packed 8-bit samples (1 or 3 per pixel) to RGBA, opaque. The
// soft mask, if any, stays in the PDF as its own image.
export const toRgba = (
	samples: Uint8Array,
	width: number,
	height: number,
	channels: 1 | 3,
): Uint8ClampedArray<ArrayBuffer> | null => {
	const pixels = width * height;

	if (samples.length < pixels * channels) return null;

	const out = new Uint8ClampedArray(pixels * 4);

	if (channels === 1) {
		for (let p = 0; p < pixels; p++) {
			const g = samples[p];
			const o = p * 4;
			out[o] = g;
			out[o + 1] = g;
			out[o + 2] = g;
			out[o + 3] = 255;
		}
	} else {
		for (let p = 0; p < pixels; p++) {
			const s = p * 3;
			const o = p * 4;
			out[o] = samples[s];
			out[o + 1] = samples[s + 1];
			out[o + 2] = samples[s + 2];
			out[o + 3] = 255;
		}
	}

	return out;
};

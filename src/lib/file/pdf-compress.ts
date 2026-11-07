import { unzlibSync, zlibSync } from "fflate";
import {
	PDFArray,
	PDFBool,
	PDFDict,
	type PDFDocument,
	PDFName,
	PDFNumber,
	type PDFObject,
	PDFRawStream,
	PDFRef,
	PDFStream,
} from "pdf-lib";

import {
	fitToBudget,
	type ImageSettings,
	isSmaller,
	type PixelBudget,
	type PixelSize,
	pixelBudget,
	widestBudget,
} from "./pdf-compress-presets.ts";
import {
	type ColorSpaceFacts,
	expectedInflatedBytes,
	type ImageFacts,
	planImage,
	toRgba,
	unpredict,
} from "./pdf-image-raster.ts";

// pdf-lib logic for the PDF compressor. Runs inside src/workers/pdf.worker.ts
// and is kept here so vitest can exercise it. Pass 1 (images) re-encodes JPEG
// and 8-bit gray or RGB Flate images; pass 2 (lossless) rewrites the file
// without changing a pixel or a glyph.

// --- Ports --------------------------------------------------------------------

export interface EncodedImage {
	readonly bytes: Uint8Array;
	readonly width: number;
	readonly height: number;
}

// The browser half of pass 1. The worker passes the real one (createImageBitmap
// and OffscreenCanvas, in pdf-image-codec.ts); tests pass a fake, because node
// has neither. `resize` is null when the image keeps its size.
export interface ImageCodec {
	// True when this browser can decode and encode JPEG through the codec. Run
	// once before the first image: without it every image would fail the same
	// way and the pass would report a PDF that cannot shrink.
	readonly probe: () => Promise<boolean>;
	readonly fromJpeg: (
		source: Uint8Array,
		resize: PixelSize | null,
		quality: number,
	) => Promise<EncodedImage>;
	readonly fromRgba: (
		rgba: Uint8ClampedArray<ArrayBuffer>,
		size: PixelSize,
		resize: PixelSize | null,
		quality: number,
	) => Promise<EncodedImage>;
}

// The codec cannot run in this browser. The worker reports it as its own
// failure instead of letting every image be skipped one by one.
export class CodecUnavailableError extends Error {
	constructor() {
		super("This browser cannot re-encode images.");
		this.name = "CodecUnavailableError";
	}
}

export interface ImagePassStats {
	// Images swapped for a smaller re-encode.
	readonly recompressed: number;
	// Every other image: unsupported kinds, ones that failed to decode, and
	// ones whose re-encode came out the same size or bigger.
	readonly skipped: number;
}

// --- Reading an image dictionary ----------------------------------------------

const name = (key: string) => PDFName.of(key);
const FILTER = name("Filter");
const DECODE_PARMS = name("DecodeParms");

const numberOf = (obj: PDFObject | undefined): number | undefined =>
	obj instanceof PDFNumber ? obj.asNumber() : undefined;

const nameOf = (obj: PDFObject | undefined): string | undefined =>
	obj instanceof PDFName ? obj.decodeText() : undefined;

const filtersOf = (dict: PDFDict): ReadonlyArray<string> => {
	const filter = dict.lookup(FILTER);

	if (filter instanceof PDFName) return [filter.decodeText()];

	if (filter instanceof PDFArray) {
		return filter
			.asArray()
			.map((item) => nameOf(dict.context.lookup(item)) ?? "");
	}

	return [];
};

// The /DecodeParms of the single filter: a dictionary, or an array holding one.
const decodeParmsOf = (dict: PDFDict): PDFDict | undefined => {
	const parms = dict.lookup(DECODE_PARMS) ?? dict.lookup(name("DP"));
	const first =
		parms instanceof PDFArray && parms.size() > 0
			? dict.context.lookup(parms.get(0))
			: parms;

	return first instanceof PDFDict ? first : undefined;
};

type Family = Exclude<ColorSpaceFacts["family"], "ICCBased" | "Unknown">;

const COLOR_FAMILIES: ReadonlyArray<Family> = [
	"DeviceGray",
	"DeviceRGB",
	"CalGray",
	"CalRGB",
	"DeviceCMYK",
	"Indexed",
	"Lab",
	"Separation",
	"DeviceN",
	"Pattern",
];

const asFamily = (value: string | undefined): Family | "Unknown" =>
	COLOR_FAMILIES.find((family) => family === value) ?? "Unknown";

export const colorSpaceFacts = (
	context: PDFDict["context"],
	value: PDFObject | undefined,
): ColorSpaceFacts => {
	if (value instanceof PDFName) return { family: asFamily(value.decodeText()) };

	if (value instanceof PDFArray && value.size() > 0) {
		const family = nameOf(context.lookup(value.get(0)));

		if (family === "ICCBased") {
			const profile =
				value.size() > 1 ? context.lookup(value.get(1)) : undefined;

			return {
				family: "ICCBased",
				components:
					profile instanceof PDFStream
						? numberOf(profile.dict.lookup(name("N")))
						: undefined,
			};
		}

		return { family: asFamily(family) };
	}

	return { family: "Unknown" };
};

export const readImageFacts = (stream: PDFRawStream): ImageFacts => {
	const { dict } = stream;
	const context = dict.context;
	const parms = decodeParmsOf(dict);
	const mask = dict.lookup(name("Mask"));
	const softMask = dict.lookup(name("SMask"));

	return {
		width: numberOf(dict.lookup(name("Width"))) ?? 0,
		height: numberOf(dict.lookup(name("Height"))) ?? 0,
		bitsPerComponent: numberOf(dict.lookup(name("BitsPerComponent"))),
		imageMask: dict.lookup(name("ImageMask")) === PDFBool.True,
		hasDecode: dict.has(name("Decode")),
		hasColorKeyMask: mask instanceof PDFArray,
		hasMatte: softMask instanceof PDFStream && softMask.dict.has(name("Matte")),
		filters: filtersOf(dict),
		colorSpace: colorSpaceFacts(context, dict.lookup(name("ColorSpace"))),
		predictor: numberOf(parms?.lookup(name("Predictor"))),
		predictorColors: numberOf(parms?.lookup(name("Colors"))),
		predictorBitsPerComponent: numberOf(
			parms?.lookup(name("BitsPerComponent")),
		),
		predictorColumns: numberOf(parms?.lookup(name("Columns"))),
		encodedBytes: stream.contents.length,
	};
};

// --- Finding the images -------------------------------------------------------

interface Candidate {
	readonly ref: PDFRef;
	readonly stream: PDFRawStream;
	// The biggest pixel box any page showing this image allows.
	budget: PixelBudget;
}

const XOBJECT = name("XObject");
const SUBTYPE = name("Subtype");
const RESOURCES = name("Resources");

// Letter size, for a page whose box is missing or degenerate.
const FALLBACK_PAGE = { width: 612, height: 792 };

const USER_UNIT = name("UserUnit");

// The visible page in points. /UserUnit is applied by pixelBudget.
const pageSize = (page: ReturnType<PDFDocument["getPage"]>) => {
	const { width, height } = page.getCropBox();

	return width > 0 && height > 0 ? { width, height } : FALLBACK_PAGE;
};

const userUnitOf = (page: ReturnType<PDFDocument["getPage"]>): number => {
	const unit = numberOf(page.node.lookup(USER_UNIT));

	return unit !== undefined && unit > 0 ? unit : 1;
};

// Refs used as some image's /SMask or /Mask, found by looking at every image
// stream in the file, not only the ones a page reaches: a mask must stay bound
// to its owner even when the owner hangs off an annotation or a pattern.
const findMaskRefs = (doc: PDFDocument): Set<string> => {
	const maskRefs = new Set<string>();

	for (const [, object] of doc.context.enumerateIndirectObjects()) {
		if (!(object instanceof PDFStream)) continue;

		if (nameOf(object.dict.lookup(SUBTYPE)) !== "Image") continue;

		for (const key of ["SMask", "Mask"]) {
			const mask = object.dict.get(name(key));

			if (mask instanceof PDFRef) maskRefs.add(mask.toString());
		}
	}

	return maskRefs;
};

interface Collected {
	// Keyed by "12 0 R". An image shared by several pages appears once.
	readonly images: Map<string, Candidate>;
	// Refs used as another image's /SMask or /Mask. Their dimensions and colour
	// space are bound to their owner, so they are never touched.
	readonly maskRefs: Set<string>;
}

// Walk every page's XObjects, going into Form XObjects' own resources. Each
// image is collected once, however many pages and forms use it.
export const collectImages = (doc: PDFDocument, maxDpi: number): Collected => {
	const { context } = doc;
	const images = new Map<string, Candidate>();
	const maskRefs = findMaskRefs(doc);

	for (const page of doc.getPages()) {
		const size = pageSize(page);
		const budget = pixelBudget(
			size.width,
			size.height,
			maxDpi,
			userUnitOf(page),
		);
		// Forms are visited once per page. A form that draws itself, directly or
		// through another form, would otherwise never finish.
		const seenForms = new Set<string>();
		const pending: PDFDict[] = [];
		const pageResources = page.node.Resources();

		if (pageResources) pending.push(pageResources);

		while (pending.length > 0) {
			const xObjects = pending.pop()?.lookup(XOBJECT);

			if (!(xObjects instanceof PDFDict)) continue;

			for (const entry of xObjects.values()) {
				if (!(entry instanceof PDFRef)) continue;

				const object = context.lookup(entry);

				if (!(object instanceof PDFRawStream)) continue;

				const subtype = nameOf(object.dict.lookup(SUBTYPE));
				const key = entry.toString();

				if (subtype === "Form") {
					if (seenForms.has(key)) continue;
					seenForms.add(key);

					const inner = object.dict.lookup(RESOURCES);

					if (inner instanceof PDFDict) pending.push(inner);
				} else if (subtype === "Image") {
					const known = images.get(key);

					if (known) {
						known.budget = widestBudget(known.budget, budget);
					} else {
						images.set(key, { ref: entry, stream: object, budget });
					}
				}
			}
		}
	}

	return { images, maskRefs };
};

// --- Pass 1: images -----------------------------------------------------------

const FILTER_DCT = name("DCTDecode");
const DEVICE_RGB = name("DeviceRGB");

// Inflate into a buffer of exactly the expected size, then undo the predictor.
// The inflated bytes are a local here, so they can be collected as soon as this
// returns, before the RGBA copy is built. The buffer has one spare byte: a
// stream that inflates to more than it claims fills it and is rejected, so a
// decompression bomb never grows past the size its image dictionary promises.
const unpredictedSamples = (
	stream: PDFRawStream,
	facts: ImageFacts,
	channels: 1 | 3,
): Uint8Array | null => {
	const expected = expectedInflatedBytes(facts, channels);

	if (expected === null) return null;

	const inflated = unzlibSync(stream.contents, {
		out: new Uint8Array(expected + 1),
	});

	if (inflated.length !== expected) return null;

	return unpredict(inflated, {
		predictor: facts.predictor,
		colors: facts.predictorColors ?? 1,
		bitsPerComponent: facts.predictorBitsPerComponent ?? 8,
		columns: facts.predictorColumns ?? 1,
	});
};

// Flate samples to opaque RGBA. A size mismatch anywhere returns null, and the
// image is skipped.
const flateToRgba = (
	stream: PDFRawStream,
	facts: ImageFacts,
	channels: 1 | 3,
): Uint8ClampedArray<ArrayBuffer> | null => {
	const samples = unpredictedSamples(stream, facts, channels);

	return samples === null
		? null
		: toRgba(samples, facts.width, facts.height, channels);
};

// Re-encode one image. Returns true when its stream was replaced. Anything
// that cannot be handled, or that does not come out smaller, returns false and
// leaves the PDF untouched.
const recompressImage = async (
	doc: PDFDocument,
	candidate: Candidate,
	settings: ImageSettings,
	codec: ImageCodec,
): Promise<boolean> => {
	const { stream, ref, budget } = candidate;
	const facts = readImageFacts(stream);
	const plan = planImage(facts);

	if (plan.kind === "skip") return false;

	const fit = fitToBudget(facts.width, facts.height, budget);
	const resize = fit.scaled ? { width: fit.width, height: fit.height } : null;
	let encoded: EncodedImage;

	if (plan.kind === "jpeg") {
		encoded = await codec.fromJpeg(stream.contents, resize, settings.quality);
	} else {
		const decoded = flateToRgba(stream, facts, plan.channels);

		if (decoded === null) return false;

		encoded = await codec.fromRgba(
			decoded,
			{ width: facts.width, height: facts.height },
			resize,
			settings.quality,
		);
	}

	if (!isSmaller(stream.contents.length, encoded.bytes.length)) return false;

	const { dict } = stream;

	dict.set(FILTER, FILTER_DCT);
	dict.delete(DECODE_PARMS);
	dict.delete(name("DP"));
	dict.set(name("Width"), PDFNumber.of(encoded.width));
	dict.set(name("Height"), PDFNumber.of(encoded.height));
	dict.set(name("BitsPerComponent"), PDFNumber.of(8));

	// The canvas writes colour JPEGs only, so a gray image comes back as RGB
	// and its colour space has to say so. Gray pixels stay gray (r = g = b).
	if (plan.channels === 1) dict.set(name("ColorSpace"), DEVICE_RGB);

	doc.context.assign(ref, PDFRawStream.of(dict, encoded.bytes));

	return true;
};

// Shrink the document's images in place, one at a time so the worker holds a
// single decoded image at once. A failure on one image counts it as skipped; it
// never fails the pass.
export const recompressImages = async (
	doc: PDFDocument,
	settings: ImageSettings,
	codec: ImageCodec,
	onProgress?: (done: number, total: number) => void,
): Promise<ImagePassStats> => {
	const { images, maskRefs } = collectImages(doc, settings.maxDpi);
	const total = images.size;

	// Checked once, and only when there is something to re-encode. A browser
	// that cannot run the codec would otherwise fail every image the same way,
	// and the result would read as a PDF that cannot shrink.
	if (total > 0 && !(await codec.probe())) throw new CodecUnavailableError();

	let recompressed = 0;
	let done = 0;

	onProgress?.(0, total);

	for (const [key, candidate] of images) {
		if (!maskRefs.has(key)) {
			const replaced = await recompressImage(
				doc,
				candidate,
				settings,
				codec,
			).catch(() => false);

			if (replaced) recompressed += 1;
		}

		done += 1;
		onProgress?.(done, total);
	}

	return { recompressed, skipped: total - recompressed };
};

// --- Pass 2: lossless ---------------------------------------------------------

// Everything the trailer can reach, as "12 0 R" keys. Iterative: outline and
// page-tree chains can be thousands of objects long.
const reachableRefs = (doc: PDFDocument): Set<string> => {
	const { context } = doc;
	const seen = new Set<string>();
	const { Root, Info, Encrypt } = context.trailerInfo;
	const stack: Array<PDFObject | undefined> = [Root, Info, Encrypt];

	while (stack.length > 0) {
		const next = stack.pop();

		if (next instanceof PDFRef) {
			const key = next.toString();

			if (seen.has(key)) continue;
			seen.add(key);
			stack.push(context.lookup(next));
		} else if (next instanceof PDFDict) {
			// A loop, not push(...values): a page tree can hold more entries than a
			// call may take as arguments.
			for (const value of next.values()) stack.push(value);
		} else if (next instanceof PDFArray) {
			for (const value of next.asArray()) stack.push(value);
		} else if (next instanceof PDFStream) {
			stack.push(next.dict);
		}
	}

	return seen;
};

// pdf-lib writes back every object it parsed, so objects an earlier edit
// orphaned (old images, replaced pages, the previous cross-reference stream)
// would stay in the file. Delete what the trailer cannot reach.
export const dropUnreferencedObjects = (doc: PDFDocument): number => {
	const reachable = reachableRefs(doc);
	let dropped = 0;

	for (const [ref] of doc.context.enumerateIndirectObjects()) {
		if (!reachable.has(ref.toString()) && doc.context.delete(ref)) dropped += 1;
	}

	return dropped;
};

const TYPE = name("Type");
const FLATE = name("FlateDecode");
// Streams a reader or a standard expects to find unfiltered or rewrites itself.
const LEAVE_UNFILTERED = new Set(["Metadata", "XRef", "ObjStm"]);
// XMP packets are XML, and some are written without a /Type. Tools that scan
// a PDF for XMP read the bytes as they are, so any XML stream stays raw.
const LEAVE_UNFILTERED_SUBTYPES = new Set(["XML"]);
const METADATA = name("Metadata");
// Below this, the zlib header and checksum eat the gain.
const MIN_FLATE_BYTES = 256;

// Deflate every stream that is stored raw (some generators write page content
// uncompressed). Lossless by construction; a stream only changes when the
// deflated bytes are smaller.
export const deflateRawStreams = (doc: PDFDocument): number => {
	const rootMetadata = doc.catalog.get(METADATA);
	let changed = 0;

	for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
		if (!(object instanceof PDFRawStream)) continue;

		const { dict, contents } = object;

		if (dict.has(FILTER) || dict.has(DECODE_PARMS)) continue;

		if (contents.length < MIN_FLATE_BYTES) continue;

		if (LEAVE_UNFILTERED.has(nameOf(dict.lookup(TYPE)) ?? "")) continue;

		if (LEAVE_UNFILTERED_SUBTYPES.has(nameOf(dict.lookup(SUBTYPE)) ?? "")) {
			continue;
		}

		if (
			rootMetadata instanceof PDFRef &&
			rootMetadata.toString() === ref.toString()
		) {
			continue;
		}

		const packed = zlibSync(contents, { level: 9 });

		if (!isSmaller(contents.length, packed.length)) continue;

		dict.set(FILTER, FLATE);
		doc.context.assign(ref, PDFRawStream.of(dict, packed));
		changed += 1;
	}

	return changed;
};

// Pass 2, v1. A later change swaps this for qpdf (`--object-streams=generate
// --recompress-flate`); the worker only calls this function, so the swap
// touches nothing else.
export type LosslessPass = (doc: PDFDocument) => Promise<Uint8Array>;

export const pdfLibLosslessPass: LosslessPass = async (doc) => {
	dropUnreferencedObjects(doc);
	deflateRawStreams(doc);

	return doc.save({
		useObjectStreams: true,
		// A document with no pages stays that way instead of gaining a blank one.
		addDefaultPage: false,
		updateFieldAppearances: false,
	});
};

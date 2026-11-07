import { Predicate } from "effect";
import { zlibSync } from "fflate";
import {
	PDFDict,
	PDFDocument,
	PDFName,
	PDFNumber,
	PDFRawStream,
	PDFRef,
} from "pdf-lib";
import { describe, expect, it } from "vitest";

import { PRESETS } from "./pdf-compress-presets.ts";
import { chooseOutcome } from "./pdf-compress-result.ts";
import {
	CodecUnavailableError,
	collectImages,
	type EncodedImage,
	type ImageCodec,
	pdfLibLosslessPass,
	recompressImages,
} from "./pdf-compress.ts";

const BALANCED = PRESETS.balanced.images;
const SMALL = PRESETS.small.images;

if (!BALANCED || !SMALL) throw new Error("presets lost their image settings");

// Deterministic noise: it does not deflate, so streams stay above the size
// below which the pass would not look at an image.
const noise = (length: number, seed = 7) => {
	const out = new Uint8Array(length);
	let state = seed;

	for (let i = 0; i < length; i++) {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		out[i] = (state >> 16) & 0xff;
	}

	return out;
};

// A JPEG that pdf-lib accepts (it reads the SOF header and nothing else). It
// never has to decode: the fake codec below stands in for the browser.
const fakeJpeg = (width: number, height: number, components: 1 | 3 | 4) => {
	const header = [
		0xff,
		0xd8,
		0xff,
		0xc0,
		0,
		8 + components * 3,
		8,
		height >> 8,
		height & 0xff,
		width >> 8,
		width & 0xff,
		components,
	];

	for (let c = 0; c < components; c++) header.push(c + 1, 0x11, 0);

	return Uint8Array.of(...header, ...noise(60_000), 0xff, 0xd9);
};

interface Call {
	readonly kind: "jpeg" | "rgba";
	readonly resize: { width: number; height: number } | null;
	readonly quality: number;
	readonly rgba?: Uint8ClampedArray;
}

// Shrinks every image to a quarter of its bytes and reports the size it was
// asked for, so a test can read what the pass decided.
const fakeCodec = (
	opts: { fail?: boolean; grow?: boolean; noProbe?: boolean } = {},
) => {
	const calls: Call[] = [];
	let probes = 0;

	const reply = (
		size: { width: number; height: number },
		resize: Call["resize"],
	): EncodedImage => {
		if (opts.fail) throw new Error("cannot decode");

		const out = resize ?? size;

		return {
			bytes: noise(opts.grow ? 200_000 : 10_000, 3),
			width: out.width,
			height: out.height,
		};
	};

	const codec: ImageCodec = {
		probe: () => {
			probes += 1;

			return Promise.resolve(!opts.noProbe);
		},
		fromJpeg: (source, resize, quality) => {
			calls.push({ kind: "jpeg", resize, quality });

			// The width and height are in the SOF header the fixture wrote.
			const height = (source[7] << 8) | source[8];
			const width = (source[9] << 8) | source[10];

			return Promise.resolve().then(() => reply({ width, height }, resize));
		},
		fromRgba: (rgba, size, resize, quality) => {
			calls.push({ kind: "rgba", resize, quality, rgba });

			return Promise.resolve().then(() => reply(size, resize));
		},
	};

	return { codec, calls, probeCount: () => probes };
};

const LETTER: [number, number] = [612, 792];

const addJpegPage = async (
	doc: PDFDocument,
	jpeg: Uint8Array,
	page = doc.addPage(LETTER),
) => {
	const image = await doc.embedJpg(jpeg);
	// pdf-lib writes the stream on save; the pass wants it in the document now.
	await image.embed();
	page.drawImage(image, { x: 0, y: 0, width: 100, height: 100 });

	return { page, ref: image.ref };
};

const rawImage = (
	doc: PDFDocument,
	opts: {
		width: number;
		height: number;
		samples: Uint8Array;
		colorSpace: string;
		smask?: PDFRef;
		predictor?: { colors: number; columns: number };
	},
) => {
	const stream = doc.context.stream(zlibSync(opts.samples), {
		Type: "XObject",
		Subtype: "Image",
		Width: opts.width,
		Height: opts.height,
		ColorSpace: opts.colorSpace,
		BitsPerComponent: 8,
		Filter: "FlateDecode",
	});

	if (opts.smask) stream.dict.set(PDFName.of("SMask"), opts.smask);

	if (opts.predictor) {
		stream.dict.set(
			PDFName.of("DecodeParms"),
			doc.context.obj({
				Predictor: 15,
				Colors: opts.predictor.colors,
				Columns: opts.predictor.columns,
			}),
		);
	}

	return doc.context.register(stream);
};

const reload = async (doc: PDFDocument) =>
	PDFDocument.load(await doc.save({ useObjectStreams: false }));

const streamAt = (doc: PDFDocument, ref: PDFRef) => {
	const object = doc.context.lookup(ref);

	if (!(object instanceof PDFRawStream)) throw new Error("not a stream");

	return object;
};

const numberAt = (dict: PDFDict, key: string) => {
	const value = dict.lookup(PDFName.of(key));

	return value instanceof PDFNumber ? value.asNumber() : undefined;
};

describe("recompressImages", () => {
	it("shrinks a JPEG to the page's DPI budget and makes the PDF smaller", async () => {
		const doc = await PDFDocument.create();
		const { ref } = await addJpegPage(doc, fakeJpeg(2000, 1500, 3));
		const original = await doc.save({ useObjectStreams: false });
		const { codec, calls } = fakeCodec();

		const loaded = await PDFDocument.load(original);
		const stats = await recompressImages(loaded, BALANCED, codec);
		expect(stats).toEqual({ recompressed: 1, skipped: 0 });

		const out = await reload(loaded);
		const image = streamAt(out, ref);

		// Letter at 150 DPI: 1650 px on the long side, 1275 on the short. 2000 x 1500
		// scales by the tighter 1650 / 2000 and becomes 1650 x 1238.
		expect(calls[0]).toMatchObject({
			kind: "jpeg",
			resize: { width: 1650, height: 1238 },
			quality: 0.75,
		});
		expect(numberAt(image.dict, "Width")).toBe(1650);
		expect(numberAt(image.dict, "Height")).toBe(1238);
		expect(image.contents.length).toBe(10_000);
		expect((await out.save()).length).toBeLessThan(original.length / 2);
	});

	it("uses the tighter DPI and quality of Small", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(2000, 1500, 3));
		const { codec, calls } = fakeCodec();

		await recompressImages(doc, SMALL, codec);

		// Letter at 100 DPI: 1100 long, 850 short. 1100 / 2000 is the tighter side.
		expect(calls[0]).toMatchObject({
			resize: { width: 1100, height: 825 },
			quality: 0.6,
		});
	});

	it("does not resize an image that already fits, but still re-encodes it", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(600, 400, 3));
		const { codec, calls } = fakeCodec();

		await recompressImages(doc, BALANCED, codec);

		expect(calls[0].resize).toBeNull();
	});

	it("processes an image shared by several pages once, at the biggest page's budget", async () => {
		const doc = await PDFDocument.create();
		const small = doc.addPage([306, 396]);
		const { ref } = await addJpegPage(doc, fakeJpeg(2000, 1500, 3), small);
		const big = doc.addPage(LETTER);

		big.node.newXObject("Im", ref);

		const { codec, calls } = fakeCodec();
		const stats = await recompressImages(doc, BALANCED, codec);

		expect(calls).toHaveLength(1);
		expect(stats).toEqual({ recompressed: 1, skipped: 0 });
		// The Letter page allows 1650 px on its long side, the half-size page 825.
		expect(calls[0].resize?.width).toBe(1650);
	});

	it("gives a page turned on its side the same budget as an upright one", async () => {
		const upright = await PDFDocument.create();
		await addJpegPage(upright, fakeJpeg(2000, 1500, 3));
		const turned = await PDFDocument.create();
		await addJpegPage(
			turned,
			fakeJpeg(2000, 1500, 3),
			turned.addPage([792, 612]),
		);
		const a = fakeCodec();
		const b = fakeCodec();

		await recompressImages(upright, BALANCED, a.codec);
		await recompressImages(turned, BALANCED, b.codec);

		expect(b.calls[0].resize).toEqual(a.calls[0].resize);
	});

	it("scales the budget by the page's /UserUnit", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage(LETTER);
		page.node.set(PDFName.of("UserUnit"), PDFNumber.of(2));
		await addJpegPage(doc, fakeJpeg(2000, 1500, 3), page);
		const { codec, calls } = fakeCodec();

		await recompressImages(doc, BALANCED, codec);

		// A 2x page allows 3300 px: the image already fits.
		expect(calls[0].resize).toBeNull();
	});

	describe("codec probe", () => {
		it("fails the pass, not the image, when the browser cannot run the codec", async () => {
			const doc = await PDFDocument.create();
			await addJpegPage(doc, fakeJpeg(1000, 800, 3));
			const { codec, calls } = fakeCodec({ noProbe: true });

			await expect(recompressImages(doc, BALANCED, codec)).rejects.toThrow(
				CodecUnavailableError,
			);
			expect(calls).toHaveLength(0);
		});

		it("probes once for a whole document", async () => {
			const doc = await PDFDocument.create();
			await addJpegPage(doc, fakeJpeg(1000, 800, 3));
			await addJpegPage(doc, fakeJpeg(1200, 900, 3));
			const { codec, probeCount } = fakeCodec();

			await recompressImages(doc, BALANCED, codec);

			expect(probeCount()).toBe(1);
		});

		it("does not probe a PDF with nothing to re-encode", async () => {
			const doc = await PDFDocument.create();
			doc.addPage(LETTER);
			const { codec, probeCount } = fakeCodec({ noProbe: true });

			await expect(recompressImages(doc, BALANCED, codec)).resolves.toEqual({
				recompressed: 0,
				skipped: 0,
			});
			expect(probeCount()).toBe(0);
		});
	});

	it("finds images inside Form XObjects", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage(LETTER);
		const image = await doc.embedJpg(fakeJpeg(1800, 1200, 3));
		await image.embed();

		const form = doc.context.register(
			doc.context.stream("q 100 0 0 100 0 0 cm /Im Do Q", {
				Type: "XObject",
				Subtype: "Form",
				BBox: [0, 0, 100, 100],
				Resources: { XObject: { Im: image.ref } },
			}),
		);

		page.node.newXObject("Fm", form);

		const { images } = collectImages(doc, 150);
		expect([...images.keys()]).toEqual([image.ref.toString()]);

		const { codec, calls } = fakeCodec();
		expect(await recompressImages(doc, BALANCED, codec)).toEqual({
			recompressed: 1,
			skipped: 0,
		});
		expect(calls).toHaveLength(1);
	});

	it("does not loop on a Form that draws itself", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage(LETTER);
		const form = doc.context.nextRef();

		doc.context.assign(
			form,
			doc.context.stream("", {
				Type: "XObject",
				Subtype: "Form",
				BBox: [0, 0, 1, 1],
				Resources: { XObject: { Self: form } },
			}),
		);
		page.node.newXObject("Fm", form);

		expect(collectImages(doc, 150).images.size).toBe(0);
	});

	describe("Flate images", () => {
		it("inflates, undoes a PNG predictor and hands the exact pixels to the codec", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const width = 100;
			const height = 80;
			const pixels = noise(width * height * 3, 11);

			// PNG "Up" rows: each byte stored minus the byte above it.
			const rows = new Uint8Array(height * (width * 3 + 1));

			for (let r = 0; r < height; r++) {
				const at = r * (width * 3 + 1);
				rows[at] = 2;

				for (let i = 0; i < width * 3; i++) {
					const above = r > 0 ? pixels[(r - 1) * width * 3 + i] : 0;
					rows[at + 1 + i] = (pixels[r * width * 3 + i] - above) & 0xff;
				}
			}

			const ref = rawImage(doc, {
				width,
				height,
				samples: rows,
				colorSpace: "DeviceRGB",
				predictor: { colors: 3, columns: width },
			});

			page.node.newXObject("Im", ref);
			const { codec, calls } = fakeCodec();

			expect(await recompressImages(doc, BALANCED, codec)).toEqual({
				recompressed: 1,
				skipped: 0,
			});

			const sent = calls[0].rgba;
			expect(sent?.length).toBe(width * height * 4);
			expect(Array.from(sent?.subarray(0, 8) ?? [])).toEqual([
				pixels[0],
				pixels[1],
				pixels[2],
				255,
				pixels[3],
				pixels[4],
				pixels[5],
				255,
			]);

			const image = streamAt(doc, ref);
			expect(image.dict.lookup(PDFName.of("Filter"))).toBe(
				PDFName.of("DCTDecode"),
			);
			// A DCT stream carries no predictor.
			expect(image.dict.has(PDFName.of("DecodeParms"))).toBe(false);
		});

		it("turns a gray image into an RGB JPEG and says so in its colour space", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const ref = rawImage(doc, {
				width: 150,
				height: 150,
				samples: noise(150 * 150, 5),
				colorSpace: "DeviceGray",
			});

			page.node.newXObject("Im", ref);

			expect(await recompressImages(doc, BALANCED, fakeCodec().codec)).toEqual({
				recompressed: 1,
				skipped: 0,
			});
			expect(streamAt(doc, ref).dict.lookup(PDFName.of("ColorSpace"))).toBe(
				PDFName.of("DeviceRGB"),
			);
		});

		it("skips a Flate stream that inflates to more than its dictionary says", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const ref = rawImage(doc, {
				width: 150,
				height: 150,
				// 500 bytes past 150 x 150 RGB. The inflate buffer is sized from the
				// dictionary, so the extra bytes are never allocated.
				samples: noise(150 * 150 * 3 + 500, 12),
				colorSpace: "DeviceRGB",
			});

			page.node.newXObject("Im", ref);
			const { codec, calls } = fakeCodec();

			expect(await recompressImages(doc, BALANCED, codec)).toEqual({
				recompressed: 0,
				skipped: 1,
			});
			expect(calls).toHaveLength(0);
		});

		it("leaves a Flate image alone when its data does not match its size", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const ref = rawImage(doc, {
				width: 150,
				height: 150,
				// Too short for 150 x 150 RGB.
				samples: noise(20_000, 9),
				colorSpace: "DeviceRGB",
			});

			page.node.newXObject("Im", ref);
			const { codec, calls } = fakeCodec();

			expect(await recompressImages(doc, BALANCED, codec)).toEqual({
				recompressed: 0,
				skipped: 1,
			});
			expect(calls).toHaveLength(0);
		});
	});

	describe("soft masks", () => {
		it("keeps the SMask as it was and shrinks only the colour image", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const mask = rawImage(doc, {
				width: 1400,
				height: 1400,
				samples: noise(1400 * 1400, 21).fill(128, 0, 1400 * 1400),
				colorSpace: "DeviceGray",
			});
			const color = rawImage(doc, {
				width: 1400,
				height: 1400,
				samples: noise(1400 * 1400 * 3, 22),
				colorSpace: "DeviceRGB",
				smask: mask,
			});

			page.node.newXObject("Im", color);
			// Some PDFs list the mask among the page's XObjects too.
			page.node.newXObject("Mk", mask);
			const maskBefore = streamAt(doc, mask).contents;
			const { codec, calls } = fakeCodec();

			const stats = await recompressImages(doc, BALANCED, codec);

			expect(stats).toEqual({ recompressed: 1, skipped: 1 });
			expect(calls).toHaveLength(1);

			const out = streamAt(doc, color);
			// 1400 px on a Letter page at 150 DPI: 1275 wide, still square-ish.
			expect(numberAt(out.dict, "Width")).toBe(1275);
			// The mask keeps its own size; a mask need not match its image.
			expect(out.dict.get(PDFName.of("SMask"))).toBe(mask);
			expect(streamAt(doc, mask).contents).toBe(maskBefore);
			expect(numberAt(streamAt(doc, mask).dict, "Width")).toBe(1400);
		});

		it("protects a mask whose owner no page reaches", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const mask = rawImage(doc, {
				width: 150,
				height: 150,
				samples: noise(150 * 150, 31),
				colorSpace: "DeviceGray",
			});

			// The owner hangs off nothing a page lists (an annotation or a pattern
			// would hold it). Only the mask is in the page's resources.
			rawImage(doc, {
				width: 150,
				height: 150,
				samples: noise(150 * 150 * 3, 32),
				colorSpace: "DeviceRGB",
				smask: mask,
			});
			page.node.newXObject("Mk", mask);
			const { codec, calls } = fakeCodec();

			expect(await recompressImages(doc, BALANCED, codec)).toEqual({
				recompressed: 0,
				skipped: 1,
			});
			expect(calls).toHaveLength(0);
		});

		it("skips an image whose soft mask has a Matte", async () => {
			const doc = await PDFDocument.create();
			const page = doc.addPage(LETTER);
			const mask = doc.context.register(
				doc.context.stream(noise(20_000, 1), {
					Type: "XObject",
					Subtype: "Image",
					Width: 100,
					Height: 200,
					ColorSpace: "DeviceGray",
					BitsPerComponent: 8,
					Matte: [0, 0, 0],
				}),
			);
			const color = rawImage(doc, {
				width: 100,
				height: 200,
				samples: noise(100 * 200 * 3, 2),
				colorSpace: "DeviceRGB",
				smask: mask,
			});

			page.node.newXObject("Im", color);
			const { codec, calls } = fakeCodec();

			expect(await recompressImages(doc, BALANCED, codec)).toEqual({
				recompressed: 0,
				skipped: 1,
			});
			expect(calls).toHaveLength(0);
		});
	});

	it("counts CMYK JPEGs and image masks as skipped, not as failures", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(800, 600, 4));

		const page = doc.addPage(LETTER);
		const stencil = doc.context.register(
			doc.context.stream(noise(20_000, 4), {
				Type: "XObject",
				Subtype: "Image",
				Width: 400,
				Height: 400,
				ImageMask: true,
				BitsPerComponent: 1,
				Filter: "FlateDecode",
			}),
		);

		page.node.newXObject("St", stencil);
		const { codec, calls } = fakeCodec();

		expect(await recompressImages(doc, BALANCED, codec)).toEqual({
			recompressed: 0,
			skipped: 2,
		});
		expect(calls).toHaveLength(0);
	});

	it("skips an image that fails to decode and carries on with the rest", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(1000, 800, 3));
		await addJpegPage(doc, fakeJpeg(1200, 900, 3));

		const stats = await recompressImages(
			doc,
			BALANCED,
			fakeCodec({ fail: true }).codec,
		);

		expect(stats).toEqual({ recompressed: 0, skipped: 2 });
	});

	it("keeps the original stream when the re-encode is not smaller", async () => {
		const doc = await PDFDocument.create();
		const jpeg = fakeJpeg(1000, 800, 3);
		const { ref } = await addJpegPage(doc, jpeg);
		const before = streamAt(doc, ref).contents;

		const stats = await recompressImages(
			doc,
			BALANCED,
			fakeCodec({ grow: true }).codec,
		);

		expect(stats).toEqual({ recompressed: 0, skipped: 1 });
		expect(streamAt(doc, ref).contents).toBe(before);
		expect(numberAt(streamAt(doc, ref).dict, "Width")).toBe(1000);
	});

	it("reports progress for every image", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(1000, 800, 3));
		await addJpegPage(doc, fakeJpeg(1200, 900, 3));
		const seen: Array<[number, number]> = [];

		await recompressImages(doc, BALANCED, fakeCodec().codec, (done, total) =>
			seen.push([done, total]),
		);

		expect(seen).toEqual([
			[0, 2],
			[1, 2],
			[2, 2],
		]);
	});

	it("handles a PDF with no images", async () => {
		const doc = await PDFDocument.create();
		doc.addPage(LETTER);

		expect(await recompressImages(doc, BALANCED, fakeCodec().codec)).toEqual({
			recompressed: 0,
			skipped: 0,
		});
	});
});

describe("pdfLibLosslessPass", () => {
	it("drops objects nothing references and keeps every page", async () => {
		const doc = await PDFDocument.create();
		doc.addPage(LETTER);
		doc.addPage(LETTER);
		const orphan = doc.context.register(
			doc.context.stream(noise(30_000, 8), { Type: "XObject" }),
		);
		const original = await doc.save({ useObjectStreams: false });

		const loaded = await PDFDocument.load(original);
		expect(loaded.context.lookup(orphan)).toBeDefined();

		const out = await pdfLibLosslessPass(loaded);
		const reread = await PDFDocument.load(out);

		expect(reread.getPageCount()).toBe(2);
		expect(reread.context.lookup(orphan)).toBeUndefined();
		expect(out.length).toBeLessThan(original.length);
	});

	it("deflates streams stored raw and leaves already filtered ones alone", async () => {
		const doc = await PDFDocument.create();
		const page = doc.addPage(LETTER);
		const text = "BT /F1 12 Tf 72 720 Td (Hello) Tj ET\n".repeat(400);
		const raw = doc.context.register(doc.context.stream(text));
		const filtered = rawImage(doc, {
			width: 100,
			height: 100,
			samples: noise(100 * 100 * 3, 6),
			colorSpace: "DeviceRGB",
		});

		page.node.set(PDFName.of("Contents"), raw);
		page.node.newXObject("Im", filtered);

		const original = await doc.save({ useObjectStreams: false });
		const loaded = await PDFDocument.load(original);
		const filteredBefore = streamAt(loaded, filtered).contents;
		const out = await pdfLibLosslessPass(loaded);
		const reread = await PDFDocument.load(out);
		const content = streamAt(reread, raw);

		expect(content.dict.lookup(PDFName.of("Filter"))).toBe(
			PDFName.of("FlateDecode"),
		);
		expect(content.contents.length).toBeLessThan(text.length / 4);
		expect(streamAt(reread, filtered).contents).toEqual(filteredBefore);
		expect(out.length).toBeLessThan(original.length);
	});

	it("leaves XML streams and the catalog's metadata raw", async () => {
		const doc = await PDFDocument.create();
		doc.addPage(LETTER);
		const xmp = "<x:xmpmeta>".concat("padding ".repeat(200), "</x:xmpmeta>");
		// One is the catalog's /Metadata with no /Type; the other is typed only
		// by its /Subtype.
		const root = doc.context.register(doc.context.stream(xmp));
		const xml = doc.context.register(
			doc.context.stream(xmp, { Subtype: "XML" }),
		);

		doc.catalog.set(PDFName.of("Metadata"), root);
		doc.catalog.set(PDFName.of("Extra"), xml);

		const loaded = await PDFDocument.load(
			await doc.save({ useObjectStreams: false }),
			{ updateMetadata: false },
		);
		const out = await PDFDocument.load(await pdfLibLosslessPass(loaded));

		for (const ref of [root, xml]) {
			expect(streamAt(out, ref).dict.has(PDFName.of("Filter"))).toBe(false);
			expect(streamAt(out, ref).contents.length).toBe(xmp.length);
		}
	});

	it("does not give an empty document a blank page", async () => {
		const doc = await PDFDocument.create();
		const out = await pdfLibLosslessPass(
			await PDFDocument.load(await doc.save({ addDefaultPage: false })),
		);

		expect((await PDFDocument.load(out)).getPageCount()).toBe(0);
	});

	it("keeps the page's resources reachable", async () => {
		const doc = await PDFDocument.create();
		const { ref } = await addJpegPage(doc, fakeJpeg(900, 700, 3));
		const loaded = await PDFDocument.load(
			await doc.save({ useObjectStreams: false }),
		);
		const out = await PDFDocument.load(await pdfLibLosslessPass(loaded));

		expect(streamAt(out, ref).contents.length).toBeGreaterThan(0);

		const xobjects = out
			.getPage(0)
			.node.Resources()
			?.lookup(PDFName.of("XObject"));

		expect(xobjects instanceof PDFDict).toBe(true);
		expect(xobjects instanceof PDFDict ? xobjects.values() : []).toHaveLength(
			1,
		);
	});
});

describe("both passes together", () => {
	it("gets a PDF with one big JPEG under half its size on Balanced", async () => {
		const doc = await PDFDocument.create();
		await addJpegPage(doc, fakeJpeg(3000, 2000, 3));
		const original = await doc.save({ useObjectStreams: false });

		const loaded = await PDFDocument.load(original, { updateMetadata: false });
		await recompressImages(loaded, BALANCED, fakeCodec().codec);
		const output = await pdfLibLosslessPass(loaded);

		expect(output.length).toBeLessThan(original.length / 2);
		expect(
			chooseOutcome(original.length, output.slice().buffer, {
				imagesPass: true,
				imagesRecompressed: 1,
				imagesSkipped: 0,
			})._tag,
		).toBe("Compressed");
	});
});

describe("chooseOutcome", () => {
	const stats = { imagesPass: false, imagesRecompressed: 0, imagesSkipped: 0 };

	it("keeps a smaller output", () => {
		const outcome = chooseOutcome(1000, new ArrayBuffer(400), stats);

		expect(outcome._tag).toBe("Compressed");

		if (Predicate.isTagged(outcome, "Compressed")) {
			expect(outcome.size).toBe(400);
			expect(outcome.blob.type).toBe("application/pdf");
			expect(outcome.blob.size).toBe(400);
		}
	});

	it("returns NotSmallerResult for an output that is the same size", () => {
		expect(chooseOutcome(1000, new ArrayBuffer(1000), stats)._tag).toBe(
			"NotSmallerResult",
		);
	});

	it("returns NotSmallerResult for an output that is bigger, never the bigger file", () => {
		const outcome = chooseOutcome(1000, new ArrayBuffer(1200), stats);

		expect(outcome._tag).toBe("NotSmallerResult");
		expect("blob" in outcome).toBe(false);
	});
});

import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
	loadForMetadata,
	readPdfMetadata,
	stripPdfMetadata,
} from "./pdf-metadata.ts";

const makePdf = async () => {
	const doc = await PDFDocument.create();
	doc.addPage([200, 200]);
	doc.setTitle("Quarterly report");
	doc.setAuthor("Jane Doe");
	doc.setCreator("Microsoft Word");
	doc.setCreationDate(new Date("2024-05-01T10:22:33Z"));
	const ctx = doc.context;

	const xmp = ctx.register(
		ctx.stream("<x:xmpmeta>Jane Doe</x:xmpmeta>", {
			Type: "Metadata",
			Subtype: "XML",
		}),
	);

	doc.catalog.set(PDFName.of("Metadata"), xmp);
	// An info dictionary from an earlier save that nothing references any more.
	ctx.register(
		ctx.obj({
			Author: PDFString.of("Old Name"),
			Producer: PDFString.of("Old Word"),
		}),
	);

	return doc.save({ useObjectStreams: false });
};

describe("readPdfMetadata", () => {
	it("lists the info dictionary, XMP and orphaned info", async () => {
		const report = readPdfMetadata(await loadForMetadata(await makePdf()));

		const byLabel = Object.fromEntries(
			report.fields.map((f) => [f.label, f.value]),
		);

		expect(byLabel.Title).toBe("Quarterly report");
		expect(byLabel.Author).toBe("Jane Doe");
		expect(byLabel["Created with"]).toBe("Microsoft Word");
		expect(byLabel.Created).toBe("2024-05-01 10:22:33 UTC");
		expect(byLabel["XMP data"]).toBeDefined();
		expect(byLabel["Old document info"]).toBe("1 earlier version");
	});
});

describe("stripPdfMetadata", () => {
	it("removes every field and does not stamp pdf-lib as producer", async () => {
		const { bytes, after } = await stripPdfMetadata(
			await loadForMetadata(await makePdf()),
		);

		expect(after.fields).toEqual([]);

		const reloaded = await loadForMetadata(bytes);
		expect(reloaded.getPageCount()).toBe(1);
		expect(reloaded.context.trailerInfo.Info).toBeUndefined();
		expect(reloaded.catalog.get(PDFName.of("Metadata"))).toBeUndefined();
	});

	it("leaves no author text in an uncompressed re-save", async () => {
		const { bytes } = await stripPdfMetadata(
			await loadForMetadata(await makePdf()),
		);

		const doc = await loadForMetadata(bytes);

		const plain = new TextDecoder("latin1").decode(
			await doc.save({ useObjectStreams: false }),
		);

		expect(plain).not.toContain("Jane Doe");
		expect(plain).not.toContain("Old Name");
		expect(plain).not.toContain("pdf-lib");
	});
});

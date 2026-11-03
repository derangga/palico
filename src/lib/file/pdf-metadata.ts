import {
	PDFDict,
	PDFDocument,
	PDFHexString,
	PDFName,
	type PDFObject,
	PDFRef,
	PDFStream,
	PDFString,
} from "pdf-lib";

import type {
	MetadataField,
	MetadataGroup,
	MetadataReport,
} from "#/lib/metadata/types.ts";
import { clip, formatSize } from "#/lib/metadata/types.ts";

// Pure pdf-lib logic for the Remove Metadata tool. Runs inside
// src/workers/pdf.worker.ts; kept here so vitest can exercise it directly.

const INFO_LABELS: Record<string, readonly [MetadataGroup, string]> = {
	Title: ["Other", "Title"],
	Author: ["People", "Author"],
	Subject: ["Other", "Subject"],
	Keywords: ["Other", "Keywords"],
	Creator: ["Software", "Created with"],
	Producer: ["Software", "Producer"],
	CreationDate: ["Dates", "Created"],
	ModDate: ["Dates", "Modified"],
};

// Keys that mark a dictionary as document info, even when it is an orphan
// left behind by an earlier incremental save.
const INFO_MARKERS = [
	"Author",
	"Creator",
	"Producer",
	"CreationDate",
	"ModDate",
].map((k) => PDFName.of(k));
const TYPE = PDFName.of("Type");
const METADATA = PDFName.of("Metadata");

const isMetadataStream = (obj: PDFObject | undefined): obj is PDFStream =>
	obj instanceof PDFStream && obj.dict.get(TYPE) === METADATA;

const isInfoLike = (obj: PDFObject | undefined): obj is PDFDict =>
	obj instanceof PDFDict &&
	!obj.has(TYPE) &&
	INFO_MARKERS.some((key) => obj.has(key));

const formatDate = (d: Date) =>
	Number.isNaN(d.getTime())
		? "present"
		: d
				.toISOString()
				.replace("T", " ")
				.replace(/\.\d+Z$/, " UTC");

const infoValue = (key: string, value: PDFObject): string => {
	if (value instanceof PDFString || value instanceof PDFHexString) {
		if (key === "CreationDate" || key === "ModDate") {
			try {
				return formatDate(value.decodeDate());
			} catch {
				return value.decodeText();
			}
		}
		return value.decodeText();
	}
	return value.toString();
};

export const readPdfMetadata = (doc: PDFDocument): MetadataReport => {
	const ctx = doc.context;
	const fields: MetadataField[] = [];

	const info = ctx.lookup(ctx.trailerInfo.Info);
	if (info instanceof PDFDict) {
		for (const [name, raw] of info.entries()) {
			const key = name.decodeText();
			const value = clip(infoValue(key, ctx.lookup(raw) ?? raw).trim());
			if (!value) continue;
			const [group, label] = INFO_LABELS[key] ?? ["Other", key];
			fields.push({ group, label, value });
		}
	}

	let xmpBytes = 0;
	let xmpBlocks = 0;
	let leftovers = 0;
	for (const [, obj] of ctx.enumerateIndirectObjects()) {
		if (isMetadataStream(obj)) {
			xmpBlocks++;
			xmpBytes += obj.getContentsSize();
		} else if (isInfoLike(obj) && obj !== info) {
			leftovers++;
		}
	}
	if (xmpBlocks > 0) {
		fields.push({
			group: "Other",
			label: "XMP data",
			value:
				xmpBlocks === 1
					? formatSize(xmpBytes)
					: `${xmpBlocks} blocks, ${formatSize(xmpBytes)}`,
		});
	}
	if (leftovers > 0) {
		fields.push({
			group: "Other",
			label: "Old document info",
			value: `${leftovers} earlier version${leftovers === 1 ? "" : "s"}`,
		});
	}
	return { fields, kept: [] };
};

// Remove the Info dictionary, every XMP metadata stream and every /Metadata
// reference to them, plus orphaned info dictionaries from earlier saves.
// pdf-lib writes back every object it parsed, so the orphans must be deleted
// explicitly or they survive the save.
export const stripPdfDocument = (doc: PDFDocument): void => {
	const ctx = doc.context;
	const infoRef = ctx.trailerInfo.Info;
	if (infoRef instanceof PDFRef) ctx.delete(infoRef);
	ctx.trailerInfo.Info = undefined;

	for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
		if (isMetadataStream(obj) || isInfoLike(obj)) {
			ctx.delete(ref);
		} else if (obj instanceof PDFDict) {
			obj.delete(METADATA);
		} else if (obj instanceof PDFStream) {
			obj.dict.delete(METADATA);
		}
	}
};

// `updateMetadata: false` stops pdf-lib stamping its own Producer and
// ModDate on load/save.
export const loadForMetadata = (bytes: ArrayBuffer | Uint8Array) =>
	PDFDocument.load(bytes, { updateMetadata: false });

// Strip a document loaded with loadForMetadata, save it, and re-read the
// output so the caller can verify it is clean.
export const stripPdfMetadata = async (
	doc: PDFDocument,
): Promise<{ bytes: Uint8Array; after: MetadataReport }> => {
	stripPdfDocument(doc);
	const out = await doc.save({ updateFieldAppearances: false });
	return { bytes: out, after: readPdfMetadata(await loadForMetadata(out)) };
};

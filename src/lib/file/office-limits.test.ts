import { describe, expect, it } from "vitest";

import {
	checkOfficeBatch,
	checkOfficeFile,
	isSupportedOffice,
	officeExtension,
} from "./office-limits.ts";
import {
	MAX_BATCH_BYTES,
	MAX_BATCH_FILES,
	MAX_OFFICE_BYTES,
	MB,
} from "./office-types.ts";

describe("officeExtension", () => {
	it("returns the lowercased extension", () => {
		expect(officeExtension("report.DOCX")).toBe("docx");
		expect(officeExtension("a.b.odt")).toBe("odt");
	});

	it("returns null when there is no usable extension", () => {
		expect(officeExtension("noext")).toBeNull();
		expect(officeExtension("trailingdot.")).toBeNull();
		expect(officeExtension(".hidden")).toBe("hidden"); // leading dot still parses
	});
});

describe("isSupportedOffice", () => {
	it("accepts the four supported formats regardless of case", () => {
		expect(isSupportedOffice("a.docx")).toBe(true);
		expect(isSupportedOffice("a.DOC")).toBe(true);
		expect(isSupportedOffice("a.odt")).toBe(true);
		expect(isSupportedOffice("a.Rtf")).toBe(true);
	});

	it("rejects unsupported or extension-less names", () => {
		expect(isSupportedOffice("a.pdf")).toBe(false);
		expect(isSupportedOffice("a.pages")).toBe(false);
		expect(isSupportedOffice("noext")).toBe(false);
	});
});

describe("checkOfficeFile", () => {
	it("accepts a supported file under the cap", () => {
		expect(checkOfficeFile({ name: "a.docx", size: 5 * MB })).toEqual({
			kind: "ok",
			ext: "docx",
		});
		expect(checkOfficeFile({ name: "a.docx", size: MAX_OFFICE_BYTES })).toEqual(
			{
				kind: "ok",
				ext: "docx",
			},
		);
	});

	it("reports unsupported format before checking size", () => {
		// Over the size cap AND unsupported -> unsupported wins (checked first).
		expect(
			checkOfficeFile({ name: "big.pdf", size: MAX_OFFICE_BYTES + 1 }),
		).toEqual({ kind: "unsupported" });
	});

	it("rejects a supported file over the per-file cap", () => {
		expect(
			checkOfficeFile({ name: "a.docx", size: MAX_OFFICE_BYTES + 1 }),
		).toEqual({ kind: "too-large", limitBytes: MAX_OFFICE_BYTES });
	});
});

describe("checkOfficeBatch", () => {
	it("accepts a batch within both caps", () => {
		expect(checkOfficeBatch([{ size: MB }, { size: MB }])).toEqual({
			kind: "ok",
		});
	});

	it("rejects a batch over the file-count cap", () => {
		const files = Array.from({ length: MAX_BATCH_FILES + 1 }, () => ({
			size: 1,
		}));

		expect(checkOfficeBatch(files)).toEqual({
			kind: "too-many",
			limit: MAX_BATCH_FILES,
		});
	});

	it("rejects a batch over the combined-size cap", () => {
		// Two files, each just over half the total cap -> under count, over bytes.
		const half = Math.ceil(MAX_BATCH_BYTES / 2) + 1;
		expect(checkOfficeBatch([{ size: half }, { size: half }])).toEqual({
			kind: "too-large-total",
			limitBytes: MAX_BATCH_BYTES,
		});
	});

	it("checks the count cap before the size cap", () => {
		const files = Array.from({ length: MAX_BATCH_FILES + 1 }, () => ({
			size: MAX_BATCH_BYTES,
		}));

		expect(checkOfficeBatch(files)).toEqual({
			kind: "too-many",
			limit: MAX_BATCH_FILES,
		});
	});
});

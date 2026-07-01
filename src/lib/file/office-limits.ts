import {
	MAX_BATCH_BYTES,
	MAX_BATCH_FILES,
	MAX_OFFICE_BYTES,
	type OfficeExtension,
	SUPPORTED_OFFICE_EXTENSIONS,
} from "./office-types.ts";

// Pure, framework-free validation for the Office → PDF tool. Returns
// discriminated results (like src/lib/video/limits.ts) so it stays trivially
// unit-testable; the Effect layer in office.ts maps these into typed
// TaggedErrors at the call site.

// Lowercased extension without the leading dot, or null if the name has none.
export const officeExtension = (fileName: string): string | null => {
	const dot = fileName.lastIndexOf(".");
	if (dot < 0 || dot === fileName.length - 1) return null;
	return fileName.slice(dot + 1).toLowerCase();
};

// Whether LibreOffice will convert this file here, based on its extension.
export const isSupportedOffice = (fileName: string): boolean => {
	const ext = officeExtension(fileName);
	return (
		ext !== null &&
		(SUPPORTED_OFFICE_EXTENSIONS as readonly string[]).includes(ext)
	);
};

export type FileCheck =
	| { readonly kind: "ok"; readonly ext: OfficeExtension }
	| { readonly kind: "unsupported" }
	| { readonly kind: "too-large"; readonly limitBytes: number };

// Validate one file: supported format first (cheapest, clearest failure), then
// the per-file byte cap.
export const checkOfficeFile = (file: {
	readonly name: string;
	readonly size: number;
}): FileCheck => {
	const ext = officeExtension(file.name);
	if (
		ext === null ||
		!(SUPPORTED_OFFICE_EXTENSIONS as readonly string[]).includes(ext)
	) {
		return { kind: "unsupported" };
	}
	if (file.size > MAX_OFFICE_BYTES) {
		return { kind: "too-large", limitBytes: MAX_OFFICE_BYTES };
	}
	return { kind: "ok", ext: ext as OfficeExtension };
};

export type BatchCheck =
	| { readonly kind: "ok" }
	| { readonly kind: "too-many"; readonly limit: number }
	| { readonly kind: "too-large-total"; readonly limitBytes: number };

// Validate the batch as a whole: file-count cap first, then combined-size cap.
// Per-file caps are checked separately via checkOfficeFile.
export const checkOfficeBatch = (
	files: ReadonlyArray<{ readonly size: number }>,
): BatchCheck => {
	if (files.length > MAX_BATCH_FILES) {
		return { kind: "too-many", limit: MAX_BATCH_FILES };
	}
	const total = files.reduce((sum, f) => sum + f.size, 0);
	if (total > MAX_BATCH_BYTES) {
		return { kind: "too-large-total", limitBytes: MAX_BATCH_BYTES };
	}
	return { kind: "ok" };
};

import type { PdfThumbnail } from "#/lib/file/pdf-types.ts";

export type ItemStatus = "loading" | "ready" | "error";

export type MergeItem = {
	readonly id: string;
	readonly file: File;
	status: ItemStatus;
	thumbnail: PdfThumbnail | null;
	pageCount: number;
};

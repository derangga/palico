export type ItemStatus = "ready" | "processing" | "done" | "error";

export interface Item {
	id: string;
	file: File;
	status: ItemStatus;
	outBlob?: Blob;
	outName?: string;
	outLabel?: string;
	outSize?: number;
	message?: string;
	// Compressor only: percent smaller than the input, and an extra line of copy.
	savedPct?: number;
	note?: string;
}

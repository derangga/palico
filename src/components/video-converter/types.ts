export type ItemStatus = "ready" | "processing" | "done" | "error";

export interface Item {
	id: string;
	file: File;
	status: ItemStatus;
	percent?: number;
	outBlob?: Blob;
	outName?: string;
	outSize?: number;
	outLabel?: string;
	message?: string;
}

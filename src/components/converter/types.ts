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
}

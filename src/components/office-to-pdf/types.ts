export type ItemStatus = "ready" | "converting" | "done" | "error";

export type OfficeItem = {
	readonly id: string;
	readonly file: File;
	status: ItemStatus;
	outBlob?: Blob;
	outName?: string;
	outSize?: number;
	message?: string;
};

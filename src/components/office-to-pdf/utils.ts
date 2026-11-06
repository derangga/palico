import type { OfficeItem } from "#/components/office-to-pdf/types.ts";

export { formatBytes } from "#/lib/format-bytes.ts";

export function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

export function saveOne(item: OfficeItem) {
	if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
}

export function pdfName(fileName: string) {
	const dot = fileName.lastIndexOf(".");
	const base = dot > 0 ? fileName.slice(0, dot) : fileName;

	return `${base}.pdf`;
}

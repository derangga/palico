import type { Item } from "#/components/converter/types.ts";

export { formatBytes } from "#/lib/format-bytes.ts";

export function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

export function handleSaveOne(item: Item) {
	if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
}

// Make zip entry names unique (two "photo.jpg" inputs → photo.jpg, photo-1.jpg).
export function uniqueNames(names: string[]) {
	const seen = new Map<string, number>();

	return names.map((name) => {
		const count = seen.get(name) ?? 0;
		seen.set(name, count + 1);

		if (count === 0) return name;
		const dot = name.lastIndexOf(".");

		return dot === -1
			? `${name}-${count}`
			: `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
	});
}

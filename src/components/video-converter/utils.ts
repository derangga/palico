import type { Item } from "#/components/video-converter/types.ts";
import { classifyDevice, MB } from "#/lib/video/limits.ts";

export function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;

	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;

	return `${(n / MB).toFixed(2)} MB`;
}

export function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

// Pure save helper — no local state, so it lives at module scope rather than
// being rebuilt on every render.
export function handleSaveOne(item: Item) {
	if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
}

// Reads client globals and delegates to the pure classifier. Only ever called
// from user-event handlers, so navigator/window are safe (no SSR access).
export function deviceClass() {
	return classifyDevice({
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
	});
}

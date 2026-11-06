import type { Item } from "#/components/video-converter/types.ts";
import { classifyDevice } from "#/lib/video/limits.ts";

export { formatBytes } from "#/lib/format-bytes.ts";

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

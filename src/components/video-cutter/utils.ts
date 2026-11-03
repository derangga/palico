import { Result } from "effect";

import { classifyDevice, MB } from "#/lib/video/limits.ts";
import {
	formatMeta,
	inputExtension,
	parseVideoOutputFormat,
} from "#/lib/video/types.ts";

export function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;

	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;

	return `${(n / MB).toFixed(2)} MB`;
}

// mm:ss for the selection / output duration labels.
export function formatTime(totalSeconds: number) {
	const s = Math.max(0, Math.floor(totalSeconds));
	const mins = Math.floor(s / 60);
	const secs = s % 60;

	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

// Reads client globals and delegates to the pure classifier. Only ever called
// from user-event handlers, so navigator/window are safe (no SSR access).
export function deviceClass() {
	return classifyDevice({
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
	});
}

// The container label shown in the footer. types.ts is pure (no @ffmpeg/*), so
// importing it here doesn't pull the engine into the route bundle.
export function formatLabelFor(file: File): string {
	const ext = inputExtension(file);
	const parsed = parseVideoOutputFormat(ext);

	return Result.isSuccess(parsed)
		? formatMeta(parsed.success).label
		: ext.toUpperCase();
}

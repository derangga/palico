// Draws a QR symbol as an SVG string or a PNG blob, plus the save and copy
// actions the generator page needs.

import { Effect } from "effect";

import {
	ClipboardWriteError,
	FileDownloadError,
} from "#/lib/markdown/errors.ts";
import { m } from "#/paraglide/messages.js";

import type { QrCode } from "./encode.ts";
import { QrRenderError } from "./errors.ts";
import { QUIET_ZONE_MODULES } from "./guidance.ts";

export interface QrStyle {
	/** #rrggbb */
	readonly foreground: string;
	/** #rrggbb */
	readonly background: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

// Colors end up inside an SVG attribute, so anything but #rrggbb is dropped.
const safeColor = (value: string, fallback: string): string =>
	HEX.test(value) ? value : fallback;

// Each horizontal run of dark modules becomes one rectangle, which keeps the
// SVG small even for a version 40 code.
function darkRuns(
	qr: QrCode,
): Array<readonly [x: number, y: number, length: number]> {
	const runs: Array<readonly [number, number, number]> = [];

	for (let y = 0; y < qr.size; y++) {
		let x = 0;

		while (x < qr.size) {
			if (qr.modules[y * qr.size + x] !== 1) {
				x++;
				continue;
			}

			const start = x;

			while (x < qr.size && qr.modules[y * qr.size + x] === 1) x++;

			runs.push([start, y, x - start]);
		}
	}

	return runs;
}

export function toSvg(qr: QrCode, style: QrStyle, pixels = 512): string {
	const total = qr.size + QUIET_ZONE_MODULES * 2;
	const foreground = safeColor(style.foreground, "#000000");
	const background = safeColor(style.background, "#ffffff");

	const path = darkRuns(qr)
		.map(
			([x, y, length]) =>
				`M${x + QUIET_ZONE_MODULES} ${y + QUIET_ZONE_MODULES}h${length}v1h-${length}z`,
		)
		.join("");

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="${background}"/><path d="${path}" fill="${foreground}"/></svg>`;
}

export const svgDataUrl = (svg: string): string =>
	`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * A PNG at roughly `pixels` wide. Every module is a whole number of pixels,
 * so edges stay sharp instead of blurring between modules.
 */
export const toPng = (
	qr: QrCode,
	style: QrStyle,
	pixels: number,
): Effect.Effect<Blob, QrRenderError> =>
	Effect.tryPromise({
		try: async () => {
			const total = qr.size + QUIET_ZONE_MODULES * 2;
			const scale = Math.max(1, Math.floor(pixels / total));
			const canvas = new OffscreenCanvas(total * scale, total * scale);
			const context = canvas.getContext("2d");

			if (!context) throw new Error("Could not get a 2D canvas context.");

			context.fillStyle = safeColor(style.background, "#ffffff");
			context.fillRect(0, 0, canvas.width, canvas.height);
			context.fillStyle = safeColor(style.foreground, "#000000");

			for (const [x, y, length] of darkRuns(qr)) {
				context.fillRect(
					(x + QUIET_ZONE_MODULES) * scale,
					(y + QUIET_ZONE_MODULES) * scale,
					length * scale,
					scale,
				);
			}

			return await canvas.convertToBlob({ type: "image/png" });
		},
		catch: (cause) =>
			new QrRenderError({
				message:
					cause instanceof Error
						? m.qr_err_draw_png_detail({ detail: cause.message })
						: m.qr_err_draw_png(),
			}),
	});

export const saveBlob = (
	blob: Blob,
	fileName: string,
): Effect.Effect<void, FileDownloadError> =>
	Effect.try({
		try: () => {
			const url = URL.createObjectURL(blob);

			try {
				const anchor = document.createElement("a");

				anchor.href = url;
				anchor.download = fileName;
				anchor.click();
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		catch: (cause) =>
			new FileDownloadError({
				message: cause instanceof Error ? cause.message : m.qr_err_save_file(),
			}),
	});

export const copyPng = (blob: Blob): Effect.Effect<void, ClipboardWriteError> =>
	Effect.tryPromise({
		try: () =>
			navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]),
		catch: () =>
			new ClipboardWriteError({
				message: m.qr_err_copy_image(),
			}),
	});

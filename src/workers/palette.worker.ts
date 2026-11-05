/// <reference lib="webworker" />
// Finds an image's dominant colors off the main thread. The file is decoded and
// shrunk here, so a large photo never freezes the page.
// Stateless: orchestration and typed errors live in src/lib/color/worker-client.ts.

import { extractPalette } from "#/lib/color/palette.ts";
import type {
	PaletteWorkerRequest,
	PaletteWorkerResponse,
} from "#/lib/color/worker-protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

// Color statistics do not need detail. 200 px on the long side is about 30,000
// pixels, enough that a small accent still counts and cheap to cluster.
const SAMPLE_SIDE = 200;

async function readPalette(
	request: PaletteWorkerRequest,
): Promise<PaletteWorkerResponse> {
	const { id, buffer, mimeType } = request;
	let bitmap: ImageBitmap;

	try {
		bitmap = await createImageBitmap(new Blob([buffer], { type: mimeType }));
	} catch {
		return {
			id,
			ok: false,
			reason: "image",
			message: "Couldn't open this file as an image.",
		};
	}

	try {
		const scale = Math.min(
			1,
			SAMPLE_SIDE / Math.max(bitmap.width, bitmap.height),
		);

		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d", { willReadFrequently: true });

		if (!context) throw new Error("Could not get a 2D canvas context.");

		context.imageSmoothingQuality = "high";
		context.drawImage(bitmap, 0, 0, width, height);

		const { data } = context.getImageData(0, 0, width, height);
		const colors = extractPalette(data);

		return colors.length > 0
			? { id, ok: true, colors }
			: {
					id,
					ok: false,
					reason: "empty",
					message:
						"This image is fully transparent, so it has no colors to read.",
				};
	} catch (cause) {
		return {
			id,
			ok: false,
			reason: "image",
			message:
				cause instanceof Error ? cause.message : "Couldn't read this image.",
		};
	} finally {
		bitmap.close();
	}
}

self.onmessage = async (event: MessageEvent<PaletteWorkerRequest>) => {
	self.postMessage(await readPalette(event.data));
};

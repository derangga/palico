/// <reference lib="webworker" />
// Reads QR codes off the main thread. Files are decoded to pixels here, so a
// large photo never freezes the page. Camera frames arrive as raw pixels.
// Stateless: orchestration and typed errors live in src/lib/qr/worker-client.ts.

import { decodeFrame } from "#/lib/qr/decode.ts";
import type {
	QrWorkerRequest,
	QrWorkerResponse,
} from "#/lib/qr/worker-protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

// Beyond this the decoder shrinks the picture anyway, and the pixel buffer for
// a 50-megapixel photo would not fit in memory on a phone.
const MAX_SIDE = 4096;

async function decodeFile(
	id: number,
	buffer: ArrayBuffer,
	mimeType: string,
): Promise<QrWorkerResponse> {
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
		const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * scale));
		const height = Math.max(1, Math.round(bitmap.height * scale));
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d", { willReadFrequently: true });

		if (!context) throw new Error("Could not get a 2D canvas context.");

		context.drawImage(bitmap, 0, 0, width, height);

		const { data } = context.getImageData(0, 0, width, height);
		const reading = decodeFrame({ width, height, data }, "thorough");

		return reading
			? { id, ok: true, ...reading }
			: {
					id,
					ok: false,
					reason: "not-found",
					message: "No QR code found in this image.",
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

self.onmessage = async (event: MessageEvent<QrWorkerRequest>) => {
	const request = event.data;

	if (request.type === "file") {
		self.postMessage(
			await decodeFile(request.id, request.buffer, request.mimeType),
		);

		return;
	}

	const reading = decodeFrame(
		{
			width: request.width,
			height: request.height,
			data: new Uint8ClampedArray(request.buffer),
		},
		"quick",
	);

	self.postMessage(
		reading
			? ({ id: request.id, ok: true, ...reading } satisfies QrWorkerResponse)
			: ({
					id: request.id,
					ok: false,
					reason: "not-found",
					message: "No code in this frame.",
				} satisfies QrWorkerResponse),
	);
};

/// <reference lib="webworker" />
// Raw image decode/encode executor. Runs off the main thread so large images
// never freeze the UI. Orchestration, typed errors, and concurrency live in the
// main-thread Effect pipeline (src/lib/image/converter.ts); this worker is a thin,
// stateless request/response codec.

import { searchQuality } from "#/lib/image/quality-search.ts";
import type { WorkerRequest, WorkerResponse } from "#/lib/image/types.ts";

// This file runs as a dedicated worker; the DOM lib types `self` as Window.
declare const self: DedicatedWorkerGlobalScope;

async function handle(req: WorkerRequest): Promise<{
	response: WorkerResponse;
	transfer: Transferable[];
}> {
	let bitmap: ImageBitmap;

	try {
		bitmap = await createImageBitmap(
			new Blob([req.buffer], { type: req.sourceType }),
		);
	} catch (err) {
		return {
			response: {
				id: req.id,
				ok: false,
				reason: "decode",
				message:
					err instanceof Error ? err.message : "Could not decode this image.",
			},
			transfer: [],
		};
	}

	const { width, height } = bitmap;

	if (width > req.maxDimension || height > req.maxDimension) {
		bitmap.close();

		return {
			response: {
				id: req.id,
				ok: false,
				reason: "dimensions",
				message: `Image is ${width}×${height}px, larger than the ${req.maxDimension}px limit.`,
				width,
				height,
			},
			transfer: [],
		};
	}

	// Output at the resize target when provided, else at source dimensions.
	const outW = req.targetWidth ?? width;
	const outH = req.targetHeight ?? height;

	try {
		const canvas = new OffscreenCanvas(outW, outH);
		const ctx = canvas.getContext("2d");

		if (!ctx) throw new Error("Could not get a 2D canvas context.");
		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		if (req.fillWhite) {
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, outW, outH);
		}

		ctx.drawImage(bitmap, 0, 0, outW, outH);
		bitmap.close();

		const encode = (quality: number) =>
			canvas.convertToBlob({ type: req.mime, quality });

		const { blob, quality, targetMet } =
			req.targetBytes == null
				? {
						blob: await encode(req.quality),
						quality: req.quality,
						targetMet: true,
					}
				: await searchQuality(encode, {
						targetBytes: req.targetBytes,
						max: req.quality,
					});

		// convertToBlob silently falls back to PNG for types it can't encode
		// (Safari and WebP). Fail instead of saving a PNG under a .webp name.
		if (blob.type !== req.mime) {
			const name = req.mime.replace("image/", "").toUpperCase();
			throw new Error(`This browser can't save ${name} images. Choose JPG.`);
		}

		const buffer = await blob.arrayBuffer();

		return {
			response: {
				id: req.id,
				ok: true,
				buffer,
				width: outW,
				height: outH,
				size: buffer.byteLength,
				quality,
				targetMet,
			},
			transfer: [buffer],
		};
	} catch (err) {
		bitmap.close();

		return {
			response: {
				id: req.id,
				ok: false,
				reason: "encode",
				message:
					err instanceof Error ? err.message : "Could not encode this image.",
			},
			transfer: [],
		};
	}
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
	handle(event.data).then(({ response, transfer }) => {
		self.postMessage(response, transfer);
	});
});

/// <reference lib="webworker" />
// Raw image decode/encode executor. Runs off the main thread so large images
// never freeze the UI. Orchestration, typed errors, and concurrency live in the
// main-thread Effect pipeline (src/lib/image/converter.ts); this worker is a thin,
// stateless request/response codec.

import type { WorkerRequest, WorkerResponse } from "#/lib/image/types.ts";

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
		ctx.drawImage(bitmap, 0, 0, outW, outH);
		bitmap.close();

		const blob = await canvas.convertToBlob({
			type: req.mime,
			quality: req.quality,
		});
		const buffer = await blob.arrayBuffer();

		return {
			response: {
				id: req.id,
				ok: true,
				buffer,
				width: outW,
				height: outH,
				size: buffer.byteLength,
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
		(self as DedicatedWorkerGlobalScope).postMessage(response, transfer);
	});
});

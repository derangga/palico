/// <reference lib="webworker" />
// Off-main-thread PDF loader + thumbnail rasterizer. Parses the PDF with pdf.js
// and renders each page to an OffscreenCanvas, streaming ImageBitmaps back so
// the UI never blocks. Typed orchestration + errors live in
// src/lib/file/pdf-worker-client.ts; this worker is a thin, stateless executor.

import {
	GlobalWorkerOptions,
	getDocument,
	type PDFDocumentProxy,
} from "pdfjs-dist";
// Vite emits pdf.js's core (parsing) worker as an asset and hands us its URL.
// pdf.js spawns it as a nested worker, so parsing stays off this worker's thread
// too. The bundled asset keeps everything offline — nothing is fetched at runtime.
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import type { PdfWorkerResponse, RenderRequest } from "#/lib/file/pdf-types.ts";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

interface CanvasAndContext {
	canvas: OffscreenCanvas | null;
	context: OffscreenCanvasRenderingContext2D | null;
}

// pdf.js's default canvas factory (DOMCanvasFactory) calls
// `document.createElement` for the auxiliary canvases it needs (transparency
// groups, soft masks, patterns). There is no `document` in a worker, so we hand
// pdf.js an OffscreenCanvas-backed factory instead. pdf.js instantiates this
// class itself via `new CanvasFactory({ ownerDocument, enableHWA })` and calls
// create/reset/destroy on the instance.
class OffscreenCanvasFactory {
	create(width: number, height: number): CanvasAndContext {
		const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
		return { canvas, context: canvas.getContext("2d") };
	}

	reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
		if (!canvasAndContext.canvas) return;
		canvasAndContext.canvas.width = Math.max(1, width);
		canvasAndContext.canvas.height = Math.max(1, height);
	}

	destroy(canvasAndContext: CanvasAndContext) {
		if (canvasAndContext.canvas) {
			canvasAndContext.canvas.width = 0;
			canvasAndContext.canvas.height = 0;
		}
		canvasAndContext.canvas = null;
		canvasAndContext.context = null;
	}
}

// pdf.js's default DOMFilterFactory builds SVG <filter> elements in the DOM
// (reaching for `document.URL`) to apply soft masks / alpha / luminosity / HCM
// filters. There's no DOM in a worker, so we hand pdf.js a no-op factory that
// disables those filters (returns "none"). This mirrors pdf.js's own
// BaseFilterFactory — thumbnails render best-effort, skipping advanced
// transparency filter effects rather than crashing.
class NoopFilterFactory {
	addFilter(): string {
		return "none";
	}
	addHCMFilter(): string {
		return "none";
	}
	addAlphaFilter(): string {
		return "none";
	}
	addLuminosityFilter(): string {
		return "none";
	}
	addKnockoutFilter(): string {
		return "none";
	}
	addHighlightHCMFilter(): string {
		return "none";
	}
	addSelectionHCMFilter(): string {
		return "none";
	}
	addSelectionFilter(): string {
		return "none";
	}
	createSelectionStyle(): null {
		return null;
	}
	destroy(): void {}
}

const post = (msg: PdfWorkerResponse, transfer: Transferable[] = []) => {
	(self as DedicatedWorkerGlobalScope).postMessage(msg, transfer);
};

async function render(req: RenderRequest): Promise<void> {
	const loadingTask = getDocument({
		data: new Uint8Array(req.buffer),
		CanvasFactory: OffscreenCanvasFactory,
		FilterFactory: NoopFilterFactory,
	});
	let doc: PDFDocumentProxy;
	try {
		doc = await loadingTask.promise;
	} catch (err) {
		// pdf.js raises a PasswordException when a document needs a password and a
		// (Missing|Invalid)PDFException / generic error when it can't be parsed.
		const name = (err as { name?: string } | null)?.name;
		if (name === "PasswordException") {
			post({
				type: "error",
				id: req.id,
				reason: "encrypted",
				message: "This PDF is password-protected.",
			});
		} else {
			post({
				type: "error",
				id: req.id,
				reason: "invalid",
				message:
					err instanceof Error ? err.message : "This file isn't a valid PDF.",
			});
		}
		return;
	}

	try {
		const pageCount = doc.numPages;
		if (pageCount > req.maxPages) {
			post({
				type: "error",
				id: req.id,
				reason: "too-many-pages",
				message: `This PDF has ${pageCount} pages, over the ${req.maxPages}-page limit.`,
				pageCount,
			});
			return;
		}

		post({ type: "meta", id: req.id, pageCount });

		for (let n = 1; n <= pageCount; n++) {
			const page = await doc.getPage(n);
			const base = page.getViewport({ scale: 1 });
			const scale = req.thumbnailWidth / base.width;
			const viewport = page.getViewport({ scale });
			const width = Math.max(1, Math.floor(viewport.width));
			const height = Math.max(1, Math.floor(viewport.height));

			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				post({
					type: "error",
					id: req.id,
					reason: "worker",
					message: "Could not get a 2D canvas context.",
				});
				return;
			}

			// v6: pass the context via the back-compat `canvasContext` path, which
			// requires `canvas: null`. The context belongs to our OffscreenCanvas,
			// so pdf.js rasterizes straight into it.
			await page.render({
				canvas: null,
				canvasContext: ctx as unknown as CanvasRenderingContext2D,
				viewport,
			}).promise;
			page.cleanup();

			const bitmap = canvas.transferToImageBitmap();
			post({ type: "page", id: req.id, index: n - 1, bitmap, width, height }, [
				bitmap,
			]);
		}

		post({ type: "done", id: req.id });
	} finally {
		await loadingTask.destroy();
	}
}

self.addEventListener("message", (event: MessageEvent<RenderRequest>) => {
	const req = event.data;
	if (req.type === "render") {
		render(req).catch((err) => {
			post({
				type: "error",
				id: req.id,
				reason: "worker",
				message: err instanceof Error ? err.message : "PDF worker failed.",
			});
		});
	}
});

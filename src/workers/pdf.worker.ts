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

import type {
	ExtractRequest,
	MergeRequest,
	PdfWorkerRequest,
	PdfWorkerResponse,
	RenderRequest,
	SplitRequest,
} from "#/lib/file/pdf-types.ts";

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

// pdf-lib work is CPU-bound and single-threaded, so this cap is about memory,
// not speed: it bounds how many source/output PDFs are held in flight at once so
// a large split/merge doesn't spike memory by materializing every part eagerly.
const PDF_JOB_CONCURRENCY = 4;

// Run `fn` over `items` with at most `limit` in flight, preserving input order in
// the returned array. Used to parallelize the independent per-item awaits (page
// copies, buffer loads) that were previously sequential in a for-loop.
async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	const workers = Array.from(
		{ length: Math.min(Math.max(1, limit), items.length) },
		async () => {
			while (cursor < items.length) {
				const index = cursor++;
				results[index] = await fn(items[index], index);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

// Classify a PDF *load* failure into a typed worker error reason. pdf.js raises a
// PasswordException and pdf-lib an EncryptedPDFError for password-protected
// documents; everything else is treated as an unparseable/invalid PDF. Genuine
// internal failures (copy/save) are left to the top-level "worker" catch.
function classifyLoadError(err: unknown): {
	reason: "encrypted" | "invalid";
	message: string;
} {
	const name = (err as { name?: string } | null)?.name;
	if (name === "PasswordException" || name === "EncryptedPDFError") {
		return { reason: "encrypted", message: "This PDF is password-protected." };
	}
	return {
		reason: "invalid",
		message:
			err instanceof Error ? err.message : "This file isn't a valid PDF.",
	};
}

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

		// Render at most `thumbnailLimit` pages (merge wants just the first-page
		// cover); the page-count guard above still uses the full document length.
		const renderCount =
			req.thumbnailLimit != null
				? Math.min(pageCount, req.thumbnailLimit)
				: pageCount;
		for (let n = 1; n <= renderCount; n++) {
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

// Copy the requested pages into a fresh PDF and ship the bytes back. pdf-lib is
// dynamically imported so it only loads when an extract actually runs — the
// render path (first drop) never pays for it.
async function extract(req: ExtractRequest): Promise<void> {
	const { PDFDocument } = await import("pdf-lib");
	// Loading the source and creating the empty output are independent, so run
	// them together instead of one-after-the-other.
	let src: import("pdf-lib").PDFDocument;
	let out: import("pdf-lib").PDFDocument;
	try {
		[src, out] = await Promise.all([
			PDFDocument.load(req.buffer),
			PDFDocument.create(),
		]);
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });
		return;
	}
	const pages = await out.copyPages(src, [...req.pageIndices]);
	for (const page of pages) out.addPage(page);
	const bytes = await out.save();
	// Hand back a standalone, exactly-sized ArrayBuffer we can transfer.
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	post({ type: "extracted", id: req.id, bytes: buffer }, [buffer]);
}

// Copy each part into its own PDF, bundle them all into one zip, and ship the
// zip bytes back. pdf-lib + fflate are dynamically imported so they only load
// when a split actually runs. Stored (level 0) since PDFs barely compress.
async function split(req: SplitRequest): Promise<void> {
	const [{ PDFDocument }, { zipSync }] = await Promise.all([
		import("pdf-lib"),
		import("fflate"),
	]);
	let src: import("pdf-lib").PDFDocument;
	try {
		src = await PDFDocument.load(req.buffer);
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });
		return;
	}
	// Each part is an independent output PDF (read-only shares of `src`), so build
	// them with bounded concurrency instead of strictly one at a time. Order is
	// preserved so the zip's member order matches the requested parts.
	const entries = await mapWithConcurrency(
		req.parts,
		PDF_JOB_CONCURRENCY,
		async (part) => {
			const out = await PDFDocument.create();
			const pages = await out.copyPages(src, [...part.pageIndices]);
			for (const page of pages) out.addPage(page);
			return [part.name, await out.save()] as const;
		},
	);
	const files: Record<string, Uint8Array> = Object.fromEntries(entries);
	const zipped = zipSync(files, { level: 0 });
	const buffer = zipped.buffer.slice(
		zipped.byteOffset,
		zipped.byteOffset + zipped.byteLength,
	) as ArrayBuffer;
	post({ type: "zipped", id: req.id, bytes: buffer }, [buffer]);
}

// Concatenate every page of each buffer (in array order) into one PDF and ship
// the bytes back. pdf-lib is dynamically imported so it only loads when a merge
// actually runs. Best-effort fidelity — pages copy faithfully; form fields /
// annotations / outlines / metadata are not guaranteed.
async function merge(req: MergeRequest): Promise<void> {
	const { PDFDocument } = await import("pdf-lib");
	// Creating the output and loading every source are independent, so do them
	// together (loads bounded so many large PDFs don't spike memory). The copy
	// into `out` stays sequential to preserve the requested page order.
	let out: import("pdf-lib").PDFDocument;
	let srcs: import("pdf-lib").PDFDocument[];
	try {
		[out, srcs] = await Promise.all([
			PDFDocument.create(),
			mapWithConcurrency(req.buffers, PDF_JOB_CONCURRENCY, (buffer) =>
				PDFDocument.load(buffer),
			),
		]);
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });
		return;
	}
	for (const src of srcs) {
		const pages = await out.copyPages(src, src.getPageIndices());
		for (const page of pages) out.addPage(page);
	}
	const bytes = await out.save();
	const buffer = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	post({ type: "merged", id: req.id, bytes: buffer }, [buffer]);
}

self.addEventListener("message", (event: MessageEvent<PdfWorkerRequest>) => {
	const req = event.data;
	const fail = (err: unknown) =>
		post({
			type: "error",
			id: req.id,
			reason: "worker",
			message: err instanceof Error ? err.message : "PDF worker failed.",
		});

	if (req.type === "render") {
		render(req).catch(fail);
	} else if (req.type === "extract") {
		extract(req).catch(fail);
	} else if (req.type === "split") {
		split(req).catch(fail);
	} else if (req.type === "merge") {
		merge(req).catch(fail);
	}
});

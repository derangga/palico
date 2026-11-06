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

import {
	MAX_RASTER_TOTAL_PIXELS,
	memberName,
	RASTER_JPEG_QUALITY,
	rasterSize,
} from "#/lib/file/pdf-raster.ts";
import type {
	ExtractRequest,
	MergeRequest,
	PdfWorkerRequest,
	PdfWorkerResponse,
	RasterizeRequest,
	ReadMetadataRequest,
	RenderRequest,
	SplitRequest,
	StripMetadataRequest,
} from "#/lib/file/pdf-types.ts";

// This file runs as a dedicated worker; the DOM lib types `self` as Window.
declare const self: DedicatedWorkerGlobalScope;

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
	self.postMessage(msg, transfer);
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
	const results = Array.from<R>({ length: items.length });
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
interface LoadFailure {
	readonly reason: "encrypted" | "invalid";
	readonly detail?: string;
}

function classifyLoadError(cause: unknown): LoadFailure {
	const name = cause instanceof Error ? cause.name : undefined;

	if (name === "PasswordException" || name === "EncryptedPDFError") {
		return { reason: "encrypted" };
	}

	return {
		reason: "invalid",
		detail: cause instanceof Error ? cause.message : undefined,
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
		const name = err instanceof Error ? err.name : undefined;

		if (name === "PasswordException") {
			post({
				type: "error",
				id: req.id,
				reason: "encrypted",
			});
		} else {
			post({
				type: "error",
				id: req.id,
				reason: "invalid",
				detail: err instanceof Error ? err.message : undefined,
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
					detail: "Could not get a 2D canvas context.",
				});

				return;
			}

			// v6: pass the context via the back-compat `canvasContext` path, which
			// requires `canvas: null`. The context belongs to our OffscreenCanvas,
			// so pdf.js rasterizes straight into it.
			await page.render({
				canvas: null,
				// SAFETY: pdf.js types only accept CanvasRenderingContext2D, but it renders
				// into an OffscreenCanvas context at runtime. The two missing methods,
				// getContextAttributes and drawFocusIfNeeded, are never called by pdf.js.
				// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the types do not overlap, so TypeScript needs the hop through unknown.
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

	if (req.rotations) {
		const { applyRotations } = await import("#/lib/file/pdf-organize.ts");
		applyRotations(pages, req.rotations);
	}

	for (const page of pages) out.addPage(page);
	const bytes = await out.save();

	// Hand back a standalone, exactly-sized ArrayBuffer we can transfer.
	const buffer = bytes.slice().buffer;

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

	const buffer = zipped.slice().buffer;

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

	const buffer = bytes.slice().buffer;

	post({ type: "merged", id: req.id, bytes: buffer }, [buffer]);
}

// Remove Metadata tool. The pdf-lib logic lives in src/lib/file/pdf-metadata.ts
// (unit tested); it is imported lazily like pdf-lib elsewhere in this worker.
async function readMetadata(req: ReadMetadataRequest): Promise<void> {
	const { loadForMetadata, readPdfMetadata } =
		await import("#/lib/file/pdf-metadata.ts");

	let doc: import("pdf-lib").PDFDocument;

	try {
		doc = await loadForMetadata(req.buffer);
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });

		return;
	}

	post({ type: "metadata", id: req.id, report: readPdfMetadata(doc) });
}

async function stripMetadata(req: StripMetadataRequest): Promise<void> {
	const { loadForMetadata, stripPdfMetadata } =
		await import("#/lib/file/pdf-metadata.ts");

	let doc: import("pdf-lib").PDFDocument;

	try {
		doc = await loadForMetadata(req.buffer);
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });

		return;
	}

	const { bytes, after } = await stripPdfMetadata(doc);

	const buffer = bytes.slice().buffer;

	post({ type: "stripped", id: req.id, bytes: buffer, after }, [buffer]);
}

// PDF to Images. Holds at most one page canvas and one encoded page at a time:
// each page is rendered, encoded, added to a streaming zip, and every zip chunk
// is transferred to the main thread as soon as fflate emits it.
async function rasterize(req: RasterizeRequest): Promise<void> {
	const { Zip, ZipPassThrough } = await import("fflate");

	const loadingTask = getDocument({
		data: new Uint8Array(req.buffer),
		CanvasFactory: OffscreenCanvasFactory,
		FilterFactory: NoopFilterFactory,
	});

	let doc: PDFDocumentProxy;

	try {
		doc = await loadingTask.promise;
	} catch (err) {
		post({ type: "error", id: req.id, ...classifyLoadError(err) });

		return;
	}

	try {
		const pageCount = doc.numPages;

		if (pageCount > req.maxPages) {
			post({
				type: "error",
				id: req.id,
				reason: "too-many-pages",
				pageCount,
			});

			return;
		}

		// Size every page first (no rendering) so an over-budget job fails
		// before any work, not halfway through.
		const sizes: ReturnType<typeof rasterSize>[] = [];
		let totalPixels = 0;

		for (let n = 1; n <= pageCount; n++) {
			const page = await doc.getPage(n);
			const base = page.getViewport({ scale: 1 });
			const size = rasterSize(base.width, base.height, req.dpi);
			sizes.push(size);
			totalPixels += size.width * size.height;
		}

		if (totalPixels > MAX_RASTER_TOTAL_PIXELS) {
			post({
				type: "error",
				id: req.id,
				reason: "too-large",
				dpi: req.dpi,
			});

			return;
		}

		const mime = req.format === "png" ? "image/png" : "image/jpeg";
		const ext = req.format === "png" ? "png" : "jpg";
		let pagesDone = 0;
		let finish!: () => void;
		let fail!: (err: Error) => void;

		const finished = new Promise<void>((resolve, reject) => {
			finish = resolve;
			fail = reject;
		});

		const zip = new Zip((err, chunk, final) => {
			if (err) {
				fail(err);

				return;
			}

			// Copy: a pass-through chunk can be a view of a larger buffer, and
			// transferring that would detach bytes fflate still needs.
			const bytes = chunk.slice().buffer;
			post({ type: "zip-chunk", id: req.id, bytes, pagesDone, pageCount }, [
				bytes,
			]);

			if (final) finish();
		});

		for (let n = 1; n <= pageCount; n++) {
			const { width, height, scale } = sizes[n - 1];
			const page = await doc.getPage(n);
			const viewport = page.getViewport({ scale });
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext("2d");

			if (!ctx) throw new Error("Could not get a 2D canvas context.");
			// JPEG has no alpha, and a transparent PNG page looks broken in most
			// viewers, so every page starts white.
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, width, height);
			await page.render({
				canvas: null,
				// SAFETY: pdf.js types only accept CanvasRenderingContext2D, but it renders
				// into an OffscreenCanvas context at runtime. The two missing methods,
				// getContextAttributes and drawFocusIfNeeded, are never called by pdf.js.
				// oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the types do not overlap, so TypeScript needs the hop through unknown.
				canvasContext: ctx as unknown as CanvasRenderingContext2D,
				viewport,
			}).promise;
			page.cleanup();

			const blob = await canvas.convertToBlob({
				type: mime,
				quality: RASTER_JPEG_QUALITY,
			});

			// Free the backing store before the next page allocates its own.
			canvas.width = 0;
			canvas.height = 0;
			const data = new Uint8Array(await blob.arrayBuffer());

			pagesDone = n;

			// Stored, not deflated: PNG and JPEG are already compressed.
			const entry = new ZipPassThrough(
				memberName(req.baseName, n - 1, pageCount, ext),
			);

			zip.add(entry);
			entry.push(data, true);
		}

		zip.end();
		await finished;
		post({ type: "done", id: req.id });
	} finally {
		await loadingTask.destroy();
	}
}

self.addEventListener("message", (event: MessageEvent<PdfWorkerRequest>) => {
	const req = event.data;

	const fail = (cause: unknown) =>
		post({
			type: "error",
			id: req.id,
			reason: "worker",
			detail: cause instanceof Error ? cause.message : undefined,
		});

	if (req.type === "render") {
		render(req).catch(fail);
	} else if (req.type === "extract") {
		extract(req).catch(fail);
	} else if (req.type === "split") {
		split(req).catch(fail);
	} else if (req.type === "merge") {
		merge(req).catch(fail);
	} else if (req.type === "read-metadata") {
		readMetadata(req).catch(fail);
	} else if (req.type === "strip-metadata") {
		stripMetadata(req).catch(fail);
	} else if (req.type === "rasterize") {
		rasterize(req).catch(fail);
	}
});

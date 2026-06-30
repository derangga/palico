import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Loader2, RotateCcw, UploadCloud } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { loadPdf } from "#/lib/file/pdf.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type PdfThumbnail,
} from "#/lib/file/pdf-types.ts";

export const Route = createFileRoute("/pdf-split")({
	component: PdfSplitPage,
});

const MB = 1024 * 1024;

function PdfSplitPage() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const [thumbnails, setThumbnails] = useState<ReadonlyArray<PdfThumbnail>>([]);
	const [pageCount, setPageCount] = useState(0);
	const [rendering, setRendering] = useState(false);

	async function loadFile(file: File) {
		setFileName(file.name);
		setThumbnails([]);
		setPageCount(0);
		setRendering(true);

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file }, (thumbnail) =>
				setThumbnails((prev) => [...prev, thumbnail]),
			),
		);
		setRendering(false);

		if (exit._tag === "Success") {
			setPageCount(exit.value.pageCount);
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(failure?.message ?? "Couldn't open this PDF.");
		reset();
	}

	function handleFiles(files: FileList | null) {
		const file = files?.[0];
		if (file) void loadFile(file);
	}

	function reset() {
		setFileName(null);
		setThumbnails([]);
		setPageCount(0);
		setRendering(false);
	}

	const hasDocument = fileName !== null;

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-10">
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Split PDF</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Open a PDF to see every page, then split it — entirely in your
						browser. Up to {Math.round(MAX_PDF_BYTES / MB)} MB and{" "}
						{MAX_PDF_PAGES} pages.
					</p>
				</div>
				{hasDocument && (
					<Button variant="outline" size="sm" onClick={reset}>
						<RotateCcw />
						Choose another
					</Button>
				)}
			</div>

			{!hasDocument && (
				<>
					{/** biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input. */}
					<div
						onDragOver={(e) => e.preventDefault()}
						onDrop={(e) => {
							e.preventDefault();
							handleFiles(e.dataTransfer.files);
						}}
						className="rounded-xl border border-dashed bg-card p-8 text-center"
					>
						<UploadCloud className="mx-auto size-8 text-muted-foreground" />
						<p className="mt-3 text-sm font-medium">
							Drag &amp; drop a PDF here, or
						</p>
						<Button
							variant="outline"
							size="sm"
							className="mt-3"
							onClick={() => fileInputRef.current?.click()}
						>
							Choose file
						</Button>
						<input
							id={inputId}
							ref={fileInputRef}
							type="file"
							accept="application/pdf"
							className="hidden"
							onChange={(e) => {
								handleFiles(e.target.files);
								e.target.value = "";
							}}
						/>
					</div>
				</>
			)}

			{hasDocument && (
				<div>
					<div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
						<span className="truncate font-medium text-foreground">
							{fileName}
						</span>
						{rendering ? (
							<span className="inline-flex items-center gap-1.5">
								<Loader2 className="size-3.5 animate-spin" />
								Rendering pages… {thumbnails.length}
							</span>
						) : (
							<span>
								{pageCount} {pageCount === 1 ? "page" : "pages"}
							</span>
						)}
					</div>

					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{thumbnails.map((thumbnail) => (
							<PageThumbnail key={thumbnail.index} thumbnail={thumbnail} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Paints a transferred ImageBitmap onto a canvas. Drawing is a one-shot effect
// keyed to the bitmap identity.
function PageThumbnail({ thumbnail }: { thumbnail: PdfThumbnail }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(thumbnail.bitmap, 0, 0);
	}, [thumbnail.bitmap]);

	return (
		<div className="flex flex-col items-center gap-2 rounded-lg border bg-card p-2">
			<canvas
				ref={canvasRef}
				width={thumbnail.width}
				height={thumbnail.height}
				className="h-auto w-full rounded-sm border border-border/60 bg-white shadow-xs"
			/>
			<span className="text-xs font-medium text-muted-foreground">
				{thumbnail.index + 1}
			</span>
		</div>
	);
}

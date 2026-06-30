import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Check, Download, Loader2, RotateCcw, UploadCloud } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/tabs.tsx";
import { extractPages, loadPdf } from "#/lib/file/pdf.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type PdfThumbnail,
} from "#/lib/file/pdf-types.ts";

export const Route = createFileRoute("/pdf-split")({
	component: PdfSplitPage,
});

const MB = 1024 * 1024;

type SplitMode = "extract" | "every-n" | "all";

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function baseName(name: string) {
	return name.replace(/\.pdf$/i, "");
}

function PdfSplitPage() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [thumbnails, setThumbnails] = useState<ReadonlyArray<PdfThumbnail>>([]);
	const [pageCount, setPageCount] = useState(0);
	const [rendering, setRendering] = useState(false);
	const [mode, setMode] = useState<SplitMode>("extract");
	const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
	const [extracting, setExtracting] = useState(false);

	async function loadFile(picked: File) {
		setFile(picked);
		setThumbnails([]);
		setPageCount(0);
		setSelected(new Set());
		setRendering(true);

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file: picked }, (thumbnail) =>
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
		const picked = files?.[0];
		if (picked) void loadFile(picked);
	}

	function reset() {
		setFile(null);
		setThumbnails([]);
		setPageCount(0);
		setSelected(new Set());
		setRendering(false);
		setMode("extract");
	}

	function toggle(index: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}

	function selectAll() {
		setSelected(new Set(thumbnails.map((t) => t.index)));
	}

	async function runExtract() {
		if (!file || selected.size === 0) return;
		const pageIndices = [...selected].sort((a, b) => a - b);
		setExtracting(true);
		const exit = await Effect.runPromiseExit(
			extractPages({ id: crypto.randomUUID(), file, pageIndices }),
		);
		setExtracting(false);

		if (exit._tag === "Success") {
			downloadBlob(exit.value, `${baseName(file.name)}_extracted.pdf`);
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(failure?.message ?? "Couldn't extract those pages.");
	}

	const hasDocument = file !== null;
	const ready = hasDocument && !rendering;
	const selectable = mode === "extract" && ready;

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
				// biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input.
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
			)}

			{hasDocument && (
				<div>
					<div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
						<span className="truncate font-medium text-foreground">
							{file.name}
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

					<Tabs
						value={mode}
						onValueChange={(value) => setMode(value as SplitMode)}
					>
						<TabsList>
							<TabsTrigger value="extract">Extract pages</TabsTrigger>
							<TabsTrigger value="every-n" disabled>
								Every N pages
							</TabsTrigger>
							<TabsTrigger value="all" disabled>
								All pages
							</TabsTrigger>
						</TabsList>

						<TabsContent value="extract">
							<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
								<p className="text-sm text-muted-foreground">
									{selected.size > 0 ? (
										<span className="font-medium text-foreground">
											{selected.size} of {pageCount} selected
										</span>
									) : (
										"Click pages to select, then extract them into a new PDF."
									)}
								</p>
								<div className="flex items-center gap-2">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setSelected(new Set())}
										disabled={!ready || selected.size === 0}
									>
										Clear
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={selectAll}
										disabled={!ready || selected.size === pageCount}
									>
										Select all
									</Button>
									<Button
										size="sm"
										onClick={runExtract}
										disabled={!ready || selected.size === 0 || extracting}
									>
										{extracting ? (
											<Loader2 className="animate-spin" />
										) : (
											<Download />
										)}
										Extract
									</Button>
								</div>
							</div>
						</TabsContent>
					</Tabs>

					<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{thumbnails.map((thumbnail) => (
							<PageThumbnail
								key={thumbnail.index}
								thumbnail={thumbnail}
								selectable={selectable}
								selected={selected.has(thumbnail.index)}
								onToggle={() => toggle(thumbnail.index)}
							/>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

// Paints a transferred ImageBitmap onto a canvas. Drawing is a one-shot effect
// keyed to the bitmap identity. When selectable, the whole card is a toggle.
function PageThumbnail({
	thumbnail,
	selectable,
	selected,
	onToggle,
}: {
	thumbnail: PdfThumbnail;
	selectable: boolean;
	selected: boolean;
	onToggle: () => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(thumbnail.bitmap, 0, 0);
	}, [thumbnail.bitmap]);

	return (
		<button
			type="button"
			onClick={selectable ? onToggle : undefined}
			disabled={!selectable}
			aria-pressed={selected}
			className={`group relative flex flex-col items-center gap-2 rounded-lg border bg-card p-2 text-left transition-colors ${
				selectable ? "cursor-pointer hover:border-primary/60" : "cursor-default"
			} ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}
		>
			{selectable && (
				<span
					className={`absolute right-3 top-3 z-10 flex size-5 items-center justify-center rounded-full border transition-colors ${
						selected
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background/80 text-transparent group-hover:border-primary/60"
					}`}
				>
					<Check className="size-3.5" />
				</span>
			)}
			<canvas
				ref={canvasRef}
				width={thumbnail.width}
				height={thumbnail.height}
				className="h-auto w-full rounded-sm border border-border/60 bg-white shadow-xs"
			/>
			<span className="text-xs font-medium text-muted-foreground">
				{thumbnail.index + 1}
			</span>
		</button>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	CircleAlert,
	Download,
	GripVertical,
	Loader2,
	RotateCcw,
	UploadCloud,
	X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { loadPdf, mergePdfs } from "#/lib/file/pdf.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type PdfThumbnail,
} from "#/lib/file/pdf-types.ts";

export const Route = createFileRoute("/pdf-merge")({
	component: PdfMergePage,
});

const MB = 1024 * 1024;

// Soft upper bound so a single merge can't spawn an unbounded number of worker
// loads / accumulate too much in memory. Each file still has its own 50 MB /
// 100-page guard.
const MAX_MERGE_FILES = 20;

type ItemStatus = "loading" | "ready" | "error";

type MergeItem = {
	readonly id: string;
	readonly file: File;
	status: ItemStatus;
	thumbnail: PdfThumbnail | null;
	pageCount: number;
};

function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / MB).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function PdfMergePage() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dragIndex = useRef<number | null>(null);
	const [items, setItems] = useState<ReadonlyArray<MergeItem>>([]);
	const [merging, setMerging] = useState(false);

	// Load one file's cover thumbnail + page count (applies the shared load
	// guards). Updates the placeholder in place on success; drops it on failure.
	async function loadCover(id: string, file: File) {
		let cover: PdfThumbnail | null = null;
		const exit = await Effect.runPromiseExit(
			loadPdf({ id, file, thumbnailLimit: 1 }, (thumbnail) => {
				if (cover === null) cover = thumbnail;
			}),
		);

		if (exit._tag === "Success") {
			const { pageCount } = exit.value;
			setItems((prev) =>
				prev.map((item) =>
					item.id === id
						? { ...item, status: "ready", thumbnail: cover, pageCount }
						: item,
				),
			);
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(failure?.message ?? `Couldn't open "${file.name}".`);
		setItems((prev) => prev.filter((item) => item.id !== id));
	}

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: File[] = [];
		for (const file of Array.from(fileList)) {
			if (file.type !== "application/pdf") {
				toast.error(`"${file.name}" is not a PDF.`);
				continue;
			}
			accepted.push(file);
		}

		const room = Math.max(MAX_MERGE_FILES - items.length, 0);
		if (accepted.length > room) {
			toast.error(`You can merge up to ${MAX_MERGE_FILES} PDFs at a time.`);
		}
		const taken = accepted.slice(0, room);
		if (taken.length === 0) return;

		const newItems: MergeItem[] = taken.map((file) => ({
			id: crypto.randomUUID(),
			file,
			status: "loading",
			thumbnail: null,
			pageCount: 0,
		}));
		setItems((prev) => [...prev, ...newItems]);
		for (const item of newItems) void loadCover(item.id, item.file);
	}

	function removeItem(id: string) {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}

	function reset() {
		setItems([]);
		setMerging(false);
	}

	function reorder(from: number, to: number) {
		if (from === to) return;
		setItems((prev) => {
			const next = [...prev];
			const [moved] = next.splice(from, 1);
			next.splice(to, 0, moved);
			return next;
		});
	}

	async function runMerge() {
		if (items.length < 2) return;
		setMerging(true);
		const exit = await Effect.runPromiseExit(
			mergePdfs({
				id: crypto.randomUUID(),
				files: items.map((item) => item.file),
			}),
		);
		setMerging(false);

		if (exit._tag === "Success") {
			downloadBlob(exit.value, "merged.pdf");
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(failure?.message ?? "Couldn't merge these PDFs.");
	}

	const hasItems = items.length > 0;
	const allReady = items.every((item) => item.status === "ready");
	const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
	const canMerge = items.length >= 2 && allReady && !merging;

	return (
		<div className="mx-auto w-full max-w-5xl px-6 py-10">
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-bold">Merge PDFs</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Combine several PDFs into one — entirely in your browser. Drag the
						cards to set the order. Each file up to{" "}
						{Math.round(MAX_PDF_BYTES / MB)} MB and {MAX_PDF_PAGES} pages.
					</p>
				</div>
				{hasItems && (
					<Button variant="outline" size="sm" onClick={reset}>
						<RotateCcw />
						Start over
					</Button>
				)}
			</div>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input. */}
			<div
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					addFiles(e.dataTransfer.files);
				}}
				className="rounded-xl border border-dashed bg-card p-8 text-center"
			>
				<UploadCloud className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">
					Drag &amp; drop PDFs here, or
				</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					onClick={() => fileInputRef.current?.click()}
				>
					Choose files
				</Button>
				<input
					id={inputId}
					ref={fileInputRef}
					type="file"
					accept="application/pdf"
					multiple
					className="hidden"
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = "";
					}}
				/>
			</div>

			{hasItems && (
				<div className="mt-6">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-muted-foreground">
							{items.length} {items.length === 1 ? "file" : "files"}
							{allReady && (
								<>
									{" · "}
									{totalPages} {totalPages === 1 ? "page" : "pages"} total
								</>
							)}
							{items.length < 2 && " · add at least 2 to merge"}
						</p>
						<Button onClick={runMerge} disabled={!canMerge}>
							{merging ? <Loader2 className="animate-spin" /> : <Download />}
							Merge & download
						</Button>
					</div>

					<ul className="flex flex-col gap-2">
						{items.map((item, index) => (
							<FileCard
								key={item.id}
								item={item}
								index={index}
								onRemove={() => removeItem(item.id)}
								onDragStart={() => {
									dragIndex.current = index;
								}}
								onDrop={() => {
									const from = dragIndex.current;
									dragIndex.current = null;
									if (from !== null) reorder(from, index);
								}}
							/>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

// One file's card: drag handle, cover thumbnail, name + size + page count, and a
// remove button. The whole row is draggable so the cards can be reordered.
function FileCard({
	item,
	index,
	onRemove,
	onDragStart,
	onDrop,
}: {
	item: MergeItem;
	index: number;
	onRemove: () => void;
	onDragStart: () => void;
	onDrop: () => void;
}) {
	return (
		<li
			draggable
			onDragStart={onDragStart}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				onDrop();
			}}
			className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
		>
			<GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
			<span className="text-xs font-medium text-muted-foreground">
				{index + 1}
			</span>
			<CoverThumbnail item={item} />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "ready" && (
						<>
							{" · "}
							{item.pageCount} {item.pageCount === 1 ? "page" : "pages"}
						</>
					)}
					{item.status === "loading" && " · reading…"}
					{item.status === "error" && (
						<span className="text-destructive"> · failed</span>
					)}
				</p>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label={`Remove ${item.file.name}`}
			>
				<X className="size-4" />
			</button>
		</li>
	);
}

// Paints the transferred first-page ImageBitmap onto a small canvas. Shows a
// spinner while loading and an alert glyph if the file failed to render.
function CoverThumbnail({ item }: { item: MergeItem }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const bitmap = item.thumbnail?.bitmap;
		if (!canvas || !bitmap) return;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(bitmap, 0, 0);
	}, [item.thumbnail?.bitmap]);

	if (item.status === "loading") {
		return (
			<div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-white">
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (item.status === "error" || !item.thumbnail) {
		return (
			<div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border border-border/60 bg-white">
				<CircleAlert className="size-4 text-destructive" />
			</div>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			width={item.thumbnail.width}
			height={item.thumbnail.height}
			className="h-14 w-auto shrink-0 rounded-sm border border-border/60 bg-white shadow-xs"
		/>
	);
}

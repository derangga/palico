import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { FileCard } from "#/components/pdf-merge/file-card.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";
import { Button } from "#/components/ui/button.tsx";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "#/lib/file/pdf-types.ts";
import { loadPdf, mergePdfs } from "#/lib/file/pdf.ts";

export const Route = createFileRoute("/pdf-merge")({
	component: PdfMergePage,
});

const MB = 1024 * 1024;

// Soft upper bound so a single merge can't spawn an unbounded number of worker
// loads / accumulate too much in memory. Each file still has its own 50 MB /
// 100-page guard.
const MAX_MERGE_FILES = 20;

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function PdfMergePage() {
	const dragIndex = useRef<number | null>(null);
	const [items, setItems] = useState<ReadonlyArray<MergeItem>>([]);
	const [merging, setMerging] = useState(false);

	// Load one file's cover thumbnail + page count (applies the shared load
	// guards). Updates the placeholder in place on success; drops it on failure.
	async function loadCover(id: string, file: File) {
		const exit = await Effect.runPromiseExit(
			loadPdf({ id, file, thumbnailLimit: 1 }, () => {}),
		);

		const result = toastOnExit(exit, `Couldn't open "${file.name}".`);

		if (Option.isNone(result)) {
			setItems((prev) => prev.filter((item) => item.id !== id));

			return;
		}

		const { pageCount, thumbnails } = result.value;
		const cover = thumbnails[0] ?? null;
		setItems((prev) =>
			prev.map((item) =>
				item.id === id
					? { ...item, status: "ready", thumbnail: cover, pageCount }
					: item,
			),
		);
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

		const result = toastOnExit(exit, "Couldn't merge these PDFs.");

		if (Option.isNone(result)) return;
		downloadBlob(result.value, "merged.pdf");
	}

	const hasItems = items.length > 0;
	const allReady = items.every((item) => item.status === "ready");
	const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
	const canMerge = items.length >= 2 && allReady && !merging;

	return (
		<PageShell width="wide">
			<PageHeader
				title="Merge PDFs"
				actions={
					hasItems && (
						<Button variant="outline" size="sm" onClick={reset}>
							<RotateCcw />
							Start over
						</Button>
					)
				}
			>
				Combine several PDFs into one, entirely in your browser. Drag the cards
				to set the order. Each file up to {Math.round(MAX_PDF_BYTES / MB)} MB
				and {MAX_PDF_PAGES} pages.
			</PageHeader>

			<Dropzone
				label="Drag & drop PDFs here, or"
				actionLabel="Choose files"
				hint={`PDFs up to ${Math.round(MAX_PDF_BYTES / MB)} MB and ${MAX_PDF_PAGES} pages each, ${MAX_MERGE_FILES} files at a time`}
				accept="application/pdf"
				multiple
				ariaLabel="Choose PDFs to merge"
				onFiles={addFiles}
			/>

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
		</PageShell>
	);
}

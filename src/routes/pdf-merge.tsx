import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import {
	type SavedFile,
	SavedResult,
} from "#/components/handoff/saved-result.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { FileCard } from "#/components/pdf-merge/file-card.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";
import { Button } from "#/components/ui/button.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "#/lib/file/pdf-types.ts";
import { loadPdf, mergePdfs } from "#/lib/file/pdf.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import { filesLabel, pagesLabel } from "#/lib/i18n/counts.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/pdf-merge")({
	head: () => seoHead("/pdf-merge"),
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

	// The last merged file, shown while the list it was made from is unchanged.
	const [saved, setSaved] = useState<{
		readonly from: ReadonlyArray<MergeItem>;
		readonly file: SavedFile;
	} | null>(null);

	// Load one file's cover thumbnail + page count (applies the shared load
	// guards). Updates the placeholder in place on success; drops it on failure.
	async function loadCover(id: string, file: File) {
		const exit = await Effect.runPromiseExit(
			loadPdf({ id, file, thumbnailLimit: 1 }, () => {}),
		);

		const result = toastOnExit(
			exit,
			m.pdf_open_failed_named({ name: file.name }),
		);

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

	const handoff = useHandoff(addFiles, {
		multiple: true,
		hasFile: items.length > 0,
	});

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: File[] = [];

		for (const file of Array.from(fileList)) {
			if (file.type !== "application/pdf") {
				toast.error(m.pdfmerge_not_a_pdf({ name: file.name }));
				continue;
			}

			accepted.push(file);
		}

		const room = Math.max(MAX_MERGE_FILES - items.length, 0);

		if (accepted.length > room) {
			toast.error(m.pdfmerge_too_many({ max: MAX_MERGE_FILES }));
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

		const result = toastOnExit(exit, m.pdfmerge_failed());

		if (Option.isNone(result)) return;
		recordToolUse("/pdf-merge");
		downloadBlob(result.value, "merged.pdf");
		setSaved({
			from: items,
			file: {
				blob: result.value,
				name: "merged.pdf",
				detail: `${pagesLabel(totalPages)} · ${formatBytes(result.value.size)}`,
				outputs: [{ blob: result.value, name: "merged.pdf" }],
			},
		});
	}

	const hasItems = items.length > 0;
	const allReady = items.every((item) => item.status === "ready");
	const totalPages = items.reduce((sum, item) => sum + item.pageCount, 0);
	const canMerge = items.length >= 2 && allReady && !merging;

	return (
		<PageShell width="wide">
			<PageHeader
				title={m.tool_pdf_merge_label()}
				actions={
					hasItems && (
						<Button variant="outline" size="sm" onClick={reset}>
							<RotateCcw />
							{m.common_start_over()}
						</Button>
					)
				}
			>
				{m.pdfmerge_description({
					mb: Math.round(MAX_PDF_BYTES / MB),
					pages: MAX_PDF_PAGES,
				})}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			<Dropzone
				label={m.pdfmerge_dropzone_label()}
				actionLabel={m.common_choose_files()}
				hint={m.pdfmerge_hint({
					mb: Math.round(MAX_PDF_BYTES / MB),
					pages: MAX_PDF_PAGES,
					max: MAX_MERGE_FILES,
				})}
				accept="application/pdf"
				multiple
				ariaLabel={m.pdfmerge_dropzone_aria()}
				onFiles={addFiles}
			/>

			{hasItems && (
				<div className="mt-6">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<p className="text-sm text-muted-foreground">
							{filesLabel(items.length)}
							{allReady && (
								<>
									{" · "}
									{m.pdfmerge_total({ pages: pagesLabel(totalPages) })}
								</>
							)}
							{items.length < 2 && ` · ${m.pdfmerge_add_two()}`}
						</p>
						<Button onClick={runMerge} disabled={!canMerge}>
							{merging ? <Loader2 className="animate-spin" /> : <Download />}
							{m.pdfmerge_action()}
						</Button>
					</div>

					{saved?.from === items && (
						<div className="mb-3">
							<SavedResult from="pdf_merge" saved={saved.file} />
						</div>
					)}

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

import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option, Schema } from "effect";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { useState } from "react";

import { downloadBlob } from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CoverThumbnail } from "#/components/pdf-merge/cover-thumbnail.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";
import { Button } from "#/components/ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs.tsx";
import { toastOnExit } from "#/lib/exit-toast.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	RasterDpi,
	RasterFormat,
} from "#/lib/file/pdf-types.ts";
import { loadPdf, pdfToImages } from "#/lib/file/pdf.ts";

export const Route = createFileRoute("/pdf-to-images")({
	component: PdfToImagesPage,
});

const MB = 1024 * 1024;

const DPI_OPTIONS: ReadonlyArray<{ value: RasterDpi; label: string }> = [
	{ value: 72, label: "72 DPI · screen, small files" },
	{ value: 150, label: "150 DPI · sharp, recommended" },
	{ value: 300, label: "300 DPI · print" },
];

function PdfToImagesPage() {
	// MergeItem fits as is: one file, its cover thumbnail and page count.
	const [item, setItem] = useState<MergeItem | null>(null);
	const [format, setFormat] = useState<RasterFormat>("png");
	const [dpi, setDpi] = useState<RasterDpi>(150);

	const [progress, setProgress] = useState<{
		done: number;
		total: number;
	} | null>(null);

	async function loadFile(file: File) {
		const id = crypto.randomUUID();
		setItem({ id, file, status: "loading", thumbnail: null, pageCount: 0 });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id, file, thumbnailLimit: 1 }, () => {}),
		);

		const result = toastOnExit(exit, `Couldn't open "${file.name}".`);

		if (Option.isNone(result)) {
			setItem(null);

			return;
		}

		setItem({
			id,
			file,
			status: "ready",
			thumbnail: result.value.thumbnails[0] ?? null,
			pageCount: result.value.pageCount,
		});
	}

	async function convert() {
		if (!item) return;
		setProgress({ done: 0, total: item.pageCount });

		const exit = await Effect.runPromiseExit(
			pdfToImages(
				{ id: crypto.randomUUID(), file: item.file, format, dpi },
				(done, total) => setProgress({ done, total }),
			),
		);

		setProgress(null);
		const result = toastOnExit(exit, "Couldn't turn this PDF into images.");

		if (Option.isNone(result)) return;
		downloadBlob(
			result.value,
			`${item.file.name.replace(/\.pdf$/i, "")}_images.zip`,
		);
	}

	const working = progress !== null;
	const ready = item?.status === "ready";

	const percent =
		progress && progress.total > 0
			? Math.round((progress.done / progress.total) * 100)
			: 0;

	return (
		<PageShell>
			<PageHeader
				title="PDF to Images"
				actions={
					item && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setItem(null)}
							disabled={working}
						>
							<RotateCcw />
							Choose another
						</Button>
					)
				}
			>
				Save every page of a PDF as a JPG or PNG, entirely in your browser. Up
				to {Math.round(MAX_PDF_BYTES / MB)} MB and {MAX_PDF_PAGES} pages.
			</PageHeader>

			{!item && (
				<Dropzone
					label="Drag & drop a PDF here, or"
					actionLabel="Choose file"
					hint={`PDF up to ${Math.round(MAX_PDF_BYTES / MB)} MB and ${MAX_PDF_PAGES} pages`}
					accept="application/pdf"
					ariaLabel="Choose a PDF to turn into images"
					onFiles={(files) => {
						const picked = files?.[0];

						if (picked) void loadFile(picked);
					}}
				/>
			)}

			{item && (
				<div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
					<div className="flex items-center gap-3">
						<CoverThumbnail item={item} />
						<div className="min-w-0">
							<p className="truncate text-sm font-medium">{item.file.name}</p>
							<p className="text-xs text-muted-foreground">
								{ready
									? `${item.pageCount} ${item.pageCount === 1 ? "page" : "pages"}`
									: "reading…"}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-end gap-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Format
							</span>
							<Tabs
								value={format}
								onValueChange={(value) => {
									if (Schema.is(RasterFormat)(value)) setFormat(value);
								}}
							>
								<TabsList>
									<TabsTrigger value="png" disabled={working}>
										PNG
									</TabsTrigger>
									<TabsTrigger value="jpeg" disabled={working}>
										JPG
									</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Resolution
							</span>
							<Select
								value={dpi}
								onValueChange={(value) => {
									if (Schema.is(RasterDpi)(value)) setDpi(value);
								}}
								disabled={working}
							>
								<SelectTrigger className="w-64" aria-label="Resolution">
									<SelectValue>
										{() => DPI_OPTIONS.find((o) => o.value === dpi)?.label}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{DPI_OPTIONS.map((o) => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							className="ml-auto"
							onClick={convert}
							disabled={!ready || working}
						>
							{working ? <Loader2 className="animate-spin" /> : <Download />}
							Convert & download zip
						</Button>
					</div>

					{progress && (
						<div>
							<div
								className="h-1 w-full overflow-hidden rounded-full bg-muted"
								// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- native <progress> cannot draw the striped fill.
								role="progressbar"
								aria-label="Pages converted"
								aria-valuemin={0}
								aria-valuemax={progress.total}
								aria-valuenow={progress.done}
							>
								<div
									className="progress-stripes h-full bg-cat-file transition-[width] duration-150 ease-out"
									style={{ width: `${percent}%` }}
								/>
							</div>
							<p className="mt-1.5 text-xs text-muted-foreground">
								Page {progress.done} of {progress.total}
							</p>
						</div>
					)}

					<p className="text-xs text-muted-foreground">
						PNG keeps text crisp. JPG makes smaller files for photos and scans.
						Very large pages are capped at 16 megapixels.
					</p>
				</div>
			)}
		</PageShell>
	);
}

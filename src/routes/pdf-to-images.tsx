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
import { pagesLabel } from "#/lib/i18n/counts.ts";
import { seoHead } from "#/lib/seo.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/pdf-to-images")({
	head: () => seoHead("/pdf-to-images"),
	component: PdfToImagesPage,
});

const MB = 1024 * 1024;

const dpiOptions = (): ReadonlyArray<{ value: RasterDpi; label: string }> => [
	{ value: 72, label: m.pdfimg_dpi_72() },
	{ value: 150, label: m.pdfimg_dpi_150() },
	{ value: 300, label: m.pdfimg_dpi_300() },
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

		const result = toastOnExit(
			exit,
			m.pdf_open_failed_named({ name: file.name }),
		);

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
		const result = toastOnExit(exit, m.pdfimg_failed());

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
				title={m.tool_pdf_to_images_label()}
				actions={
					item && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => setItem(null)}
							disabled={working}
						>
							<RotateCcw />
							{m.common_choose_another()}
						</Button>
					)
				}
			>
				{m.pdfimg_description()}{" "}
				{m.pdf_description_limits({
					mb: Math.round(MAX_PDF_BYTES / MB),
					pages: MAX_PDF_PAGES,
				})}
			</PageHeader>

			{!item && (
				<Dropzone
					label={m.pdf_dropzone_label()}
					actionLabel={m.common_choose_file()}
					hint={m.pdf_hint({
						mb: Math.round(MAX_PDF_BYTES / MB),
						pages: MAX_PDF_PAGES,
					})}
					accept="application/pdf"
					ariaLabel={m.pdfimg_dropzone_aria()}
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
								{ready ? pagesLabel(item.pageCount) : m.pdfimg_reading()}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-end gap-4">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								{m.pdfimg_format()}
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
								{m.pdfimg_resolution()}
							</span>
							<Select
								value={dpi}
								onValueChange={(value) => {
									if (Schema.is(RasterDpi)(value)) setDpi(value);
								}}
								disabled={working}
							>
								<SelectTrigger
									className="w-64"
									aria-label={m.pdfimg_resolution()}
								>
									<SelectValue>
										{() => dpiOptions().find((o) => o.value === dpi)?.label}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{dpiOptions().map((o) => (
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
							{m.pdfimg_action()}
						</Button>
					</div>

					{progress && (
						<div>
							<div
								className="h-1 w-full overflow-hidden rounded-full bg-muted"
								// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- native <progress> cannot draw the striped fill.
								role="progressbar"
								aria-label={m.pdfimg_progress_aria()}
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
								{m.pdfimg_progress({
									done: progress.done,
									total: progress.total,
								})}
							</p>
						</div>
					)}

					<p className="text-xs text-muted-foreground">{m.pdfimg_note()}</p>
				</div>
			)}
		</PageShell>
	);
}

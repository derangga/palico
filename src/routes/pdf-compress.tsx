import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option, Predicate } from "effect";
import { Ban, Loader2, Lock, Minimize2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ChoiceGroup } from "#/components/choice-group.tsx";
import { formatBytes } from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { ResultCard } from "#/components/pdf-compress/result-card.tsx";
import { CoverThumbnail } from "#/components/pdf-merge/cover-thumbnail.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";
import { Button } from "#/components/ui/button.tsx";
import {
	type CompressPresetId,
	DEFAULT_COMPRESS_PRESET,
} from "#/lib/file/pdf-compress-presets.ts";
import type { CompressOutcome } from "#/lib/file/pdf-compress-result.ts";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "#/lib/file/pdf-types.ts";
import { compressPdf, loadPdf } from "#/lib/file/pdf.ts";
import { pagesLabel } from "#/lib/i18n/counts.ts";
import { seoHead } from "#/lib/seo.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/pdf-compress")({
	head: () => seoHead("/pdf-compress"),
	component: PdfCompressPage,
});

const MB = 1024 * 1024;

// Functions, not constants: a label read at module load would stay in the
// language active then.
const presetChoices = (): ReadonlyArray<{
	value: CompressPresetId;
	label: string;
	detail: string;
}> => [
	{
		value: "light",
		label: m.pdfcomp_preset_light(),
		detail: m.pdfcomp_preset_light_detail(),
	},
	{
		value: "balanced",
		label: m.pdfcomp_preset_balanced(),
		detail: m.pdfcomp_preset_balanced_detail(),
	},
	{
		value: "small",
		label: m.pdfcomp_preset_small(),
		detail: m.pdfcomp_preset_small_detail(),
	},
];

// The typed failure of an exit, logged. The page splits it so a locked PDF gets
// its own panel (with the way out) instead of a toast that disappears.
const failureOf = <A, E extends { readonly message: string }>(
	exit: Exit.Exit<A, E>,
): Option.Option<E> => {
	if (!Exit.isFailure(exit)) return Option.none();

	console.error(Cause.pretty(exit.cause));

	return Cause.findErrorOption(exit.cause);
};

function PdfCompressPage() {
	const [item, setItem] = useState<MergeItem | null>(null);

	const [preset, setPreset] = useState<CompressPresetId>(
		DEFAULT_COMPRESS_PRESET,
	);

	const [outcome, setOutcome] = useState<CompressOutcome | null>(null);
	const [locked, setLocked] = useState(false);

	// `seen` is false until the worker reports its first image count, so the
	// bar can say it is getting ready instead of showing 0 of 0.
	const [progress, setProgress] = useState<{
		done: number;
		total: number;
		seen: boolean;
	} | null>(null);

	// Aborting interrupts the run, which terminates its worker (runWorkerJob
	// releases it). The page does this on Cancel and when it unmounts.
	const runRef = useRef<AbortController | null>(null);

	useEffect(
		() => () => {
			runRef.current?.abort();
		},
		[],
	);

	// Shows what went wrong. A locked PDF gets the panel, anything else a toast.
	function report(error: Option.Option<{ readonly message: string }>) {
		if (
			Option.isSome(error) &&
			Predicate.isTagged(error.value, "EncryptedPdfError")
		) {
			setLocked(true);

			return;
		}

		toast.error(
			Option.match(error, {
				onNone: () => m.pdfcomp_failed(),
				onSome: (e) => e.message,
			}),
		);
	}

	async function loadFile(file: File) {
		const id = crypto.randomUUID();
		setLocked(false);
		setOutcome(null);
		setItem({ id, file, status: "loading", thumbnail: null, pageCount: 0 });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id, file, thumbnailLimit: 1 }, () => {}),
		);

		if (Exit.isFailure(exit)) {
			setItem(null);
			report(failureOf(exit));

			return;
		}

		setItem({
			id,
			file,
			status: "ready",
			thumbnail: exit.value.thumbnails[0] ?? null,
			pageCount: exit.value.pageCount,
		});
	}

	async function compress() {
		if (!item) return;
		setOutcome(null);
		setProgress({ done: 0, total: 0, seen: false });

		const controller = new AbortController();
		runRef.current = controller;

		const exit = await Effect.runPromiseExit(
			compressPdf(
				{ id: crypto.randomUUID(), file: item.file, preset },
				(done, total) => setProgress({ done, total, seen: true }),
			),
			{ signal: controller.signal },
		);

		runRef.current = null;
		setProgress(null);

		if (Exit.isSuccess(exit)) {
			setOutcome(exit.value);

			return;
		}

		// Cancel and leaving the page both interrupt the run. Neither is a failure.
		if (Cause.hasInterruptsOnly(exit.cause)) return;

		report(failureOf(exit));
	}

	function choosePreset(next: CompressPresetId) {
		setPreset(next);
		// A result belongs to the setting that made it.
		setOutcome(null);
	}

	const working = progress !== null;
	const ready = item?.status === "ready";

	const percent =
		progress && progress.total > 0
			? Math.round((progress.done / progress.total) * 100)
			: 0;

	// Light has no image pass, and a PDF with no images, or one whose images are
	// all done, is only being saved: those get the indeterminate bar.
	const imagesRunning =
		progress !== null &&
		preset !== "light" &&
		progress.seen &&
		progress.total > 0 &&
		progress.done < progress.total;

	const stageLabel =
		preset === "light" || progress?.seen
			? m.pdfcomp_finishing()
			: m.pdfcomp_preparing();

	return (
		<PageShell>
			<PageHeader
				title={m.tool_pdf_compress_label()}
				actions={
					item && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setItem(null);
								setOutcome(null);
							}}
							disabled={working}
						>
							<RotateCcw />
							{m.common_choose_another()}
						</Button>
					)
				}
			>
				{m.pdfcomp_description()}{" "}
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
					ariaLabel={m.pdfcomp_dropzone_aria()}
					onFiles={(files) => {
						const picked = files?.[0];

						if (picked) void loadFile(picked);
					}}
				/>
			)}

			{locked && (
				<div
					role="alert"
					className="animate-pop-in mt-4 flex items-start gap-3 rounded-lg border bg-card p-4 text-sm"
				>
					<Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<p>
						{m.pdfcomp_encrypted()}{" "}
						{/* A plain link: the unlock tool is its own route, and this one is not typed yet. */}
						<a
							href="/pdf-unlock"
							className="font-semibold text-primary underline"
						>
							{m.pdfcomp_unlock_link()}
						</a>
					</p>
				</div>
			)}

			{item && (
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
						<div className="flex items-center gap-3">
							<CoverThumbnail item={item} />
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{item.file.name}</p>
								<p className="text-xs text-muted-foreground tabular-nums">
									{ready
										? `${pagesLabel(item.pageCount)} · ${formatBytes(item.file.size)}`
										: m.pdfcomp_reading()}
								</p>
							</div>
						</div>

						<ChoiceGroup
							legend={m.pdfcomp_strength()}
							name="pdf-compress-preset"
							choices={presetChoices()}
							value={preset}
							onChange={(value) => {
								if (!working) choosePreset(value);
							}}
							columns="grid-cols-1 sm:grid-cols-3"
						/>

						<div className="flex flex-wrap justify-end gap-2">
							{working && (
								<Button
									variant="outline"
									onClick={() => runRef.current?.abort()}
									className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
								>
									<Ban />
									{m.common_cancel()}
								</Button>
							)}
							<Button onClick={compress} disabled={!ready || working}>
								{working ? <Loader2 className="animate-spin" /> : <Minimize2 />}
								{working ? m.pdfcomp_working() : m.pdfcomp_action()}
							</Button>
						</div>

						{progress && imagesRunning && (
							<div>
								<div
									className="h-1 w-full overflow-hidden rounded-full bg-muted"
									// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- native <progress> cannot draw the striped fill.
									role="progressbar"
									aria-label={m.pdfcomp_progress_aria()}
									aria-valuemin={0}
									aria-valuemax={progress.total}
									aria-valuenow={progress.done}
								>
									<div
										className="progress-stripes h-full bg-cat-file transition-[width] duration-150 ease-out"
										style={{ width: `${percent}%` }}
									/>
								</div>
								<p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
									{m.pdfcomp_progress({
										done: progress.done,
										total: progress.total,
									})}
								</p>
							</div>
						)}

						{progress && !imagesRunning && (
							<div>
								{/* No value: the stripes fill the track, since there is nothing to count. */}
								<div
									className="h-1 w-full overflow-hidden rounded-full bg-muted"
									// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- native <progress> cannot draw the striped fill.
									role="progressbar"
									aria-label={m.pdfcomp_progress_aria()}
									aria-valuetext={stageLabel}
								>
									<div className="progress-stripes h-full w-full bg-cat-file" />
								</div>
								<p className="mt-1.5 text-xs text-muted-foreground">
									{stageLabel}
								</p>
							</div>
						)}

						<p className="text-xs text-muted-foreground">
							{m.pdfcomp_note()} {m.pdfcomp_note_signatures()}
						</p>
					</div>

					<ResultCard file={item.file} outcome={outcome} preset={preset} />
				</div>
			)}
		</PageShell>
	);
}

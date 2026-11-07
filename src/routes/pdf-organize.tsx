import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Download, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { useReducer, useState } from "react";

import { downloadBlob } from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import {
	type SavedFile,
	SavedResult,
} from "#/components/handoff/saved-result.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { PageGrid } from "#/components/pdf-organize/page-grid.tsx";
import {
	initialOrganizeState,
	organizeReducer,
} from "#/components/pdf-organize/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "#/lib/file/pdf-types.ts";
import { extractPages, loadPdf } from "#/lib/file/pdf.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import { pagesLabel } from "#/lib/i18n/counts.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/pdf-organize")({
	head: () => seoHead("/pdf-organize"),
	component: PdfOrganizePage,
});

const MB = 1024 * 1024;

function PdfOrganizePage() {
	const [state, dispatch] = useReducer(organizeReducer, initialOrganizeState);

	// The last saved file, shown while the pages it was made from are unchanged.
	const [saved, setSaved] = useState<{
		readonly from: typeof state.pages;
		readonly file: SavedFile;
	} | null>(null);

	async function loadFile(file: File) {
		dispatch({ type: "loadStart", file });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file }, (thumbnail) =>
				dispatch({ type: "addThumbnail", thumbnail }),
			),
		);

		const result = toastOnExit(exit, m.pdf_open_failed());

		if (Option.isNone(result)) {
			dispatch({ type: "reset" });

			return;
		}

		dispatch({ type: "loadSuccess" });
	}

	async function save() {
		if (!state.file || state.pages.length === 0) return;
		dispatch({ type: "saveStart" });

		const exit = await Effect.runPromiseExit(
			extractPages({
				id: crypto.randomUUID(),
				file: state.file,
				pageIndices: state.pages.map((p) => p.sourceIndex),
				rotations: state.pages.map((p) => p.rotation),
			}),
		);

		dispatch({ type: "saveEnd" });
		const result = toastOnExit(exit, m.pdforg_save_failed());

		if (Option.isNone(result)) return;
		recordToolUse("/pdf-organize");
		const name = `${state.file.name.replace(/\.pdf$/i, "")}_organized.pdf`;
		downloadBlob(result.value, name);
		setSaved({
			from: state.pages,
			file: {
				blob: result.value,
				name,
				detail: `${pagesLabel(state.pages.length)} · ${formatBytes(result.value.size)}`,
				outputs: [{ blob: result.value, name }],
			},
		});
	}

	function onFiles(files: FileList | null) {
		const picked = files?.[0];

		if (picked) void loadFile(picked);
	}

	const handoff = useHandoff(onFiles, { hasFile: state.file !== null });

	const busy = state.rendering || state.saving;
	const total = state.loaded.length;
	const kept = state.pages.length;

	const changed =
		kept !== total ||
		state.pages.some((p, i) => p.sourceIndex !== i || p.rotation !== 0);

	return (
		<PageShell width="wide">
			<PageHeader
				title={m.tool_pdf_organize_label()}
				actions={
					state.file && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => dispatch({ type: "reset" })}
							disabled={state.saving}
						>
							<RotateCcw />
							{m.common_choose_another()}
						</Button>
					)
				}
			>
				{m.pdforg_description()}{" "}
				{m.pdf_description_limits({
					mb: Math.round(MAX_PDF_BYTES / MB),
					pages: MAX_PDF_PAGES,
				})}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			{!state.file && (
				<Dropzone
					label={m.pdf_dropzone_label()}
					actionLabel={m.common_choose_file()}
					hint={m.pdf_hint({
						mb: Math.round(MAX_PDF_BYTES / MB),
						pages: MAX_PDF_PAGES,
					})}
					accept="application/pdf"
					ariaLabel={m.pdforg_dropzone_aria()}
					onFiles={onFiles}
				/>
			)}

			{state.file && (
				<div>
					<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
						<p className="min-w-0 text-sm text-muted-foreground">
							<span className="font-medium text-foreground">
								{state.file.name}
							</span>
							{" · "}
							{state.rendering ? (
								<span className="inline-flex items-center gap-1.5">
									<Loader2 className="size-3.5 animate-spin" />
									{m.pdf_rendering({ count: total })}
								</span>
							) : (
								m.pdforg_kept({ kept, total: pagesLabel(total) })
							)}
						</p>
						<div className="flex items-center gap-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => dispatch({ type: "restore" })}
								disabled={busy || !changed}
							>
								<Undo2 />
								{m.pdforg_restore_all()}
							</Button>
							<Button onClick={save} disabled={busy || kept === 0}>
								{state.saving ? (
									<Loader2 className="animate-spin" />
								) : (
									<Download />
								)}
								{m.pdforg_save()}
							</Button>
						</div>
					</div>

					{saved?.from === state.pages && (
						<div className="mb-4">
							<SavedResult from="pdf_organize" saved={saved.file} />
						</div>
					)}

					{kept === 0 && !state.rendering ? (
						<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
							{m.pdforg_all_deleted()}
						</p>
					) : (
						<PageGrid pages={state.pages} disabled={busy} dispatch={dispatch} />
					)}
				</div>
			)}
		</PageShell>
	);
}

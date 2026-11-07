import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Loader2, RotateCcw } from "lucide-react";
import { useReducer, useState } from "react";

import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import {
	type SavedFile,
	SavedResult,
} from "#/components/handoff/saved-result.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { PageThumbnail } from "#/components/pdf-split/page-thumbnail.tsx";
import { SplitControls } from "#/components/pdf-split/split-controls.tsx";
import {
	initialSplitState,
	type SplitAction,
	splitReducer,
} from "#/components/pdf-split/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import {
	MAX_PDF_BYTES,
	MAX_PDF_PAGES,
	type SplitPart,
} from "#/lib/file/pdf-types.ts";
import {
	allIndividualParts,
	everyNPageParts,
	extractPages,
	loadPdf,
	splitPdf,
} from "#/lib/file/pdf.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import { zippedOutputs } from "#/lib/handoff/unzip.ts";
import { filesLabel, pagesLabel } from "#/lib/i18n/counts.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/pdf-split")({
	head: () => seoHead("/pdf-split"),
	component: PdfSplitPage,
});

const MB = 1024 * 1024;

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
	const [state, dispatch] = useReducer(splitReducer, initialSplitState);

	// The last saved result, shown while the same PDF is open. Changing the mode,
	// the selection or the part size clears it, since it no longer matches.
	const [saved, setSaved] = useState<{
		readonly from: File;
		readonly file: SavedFile;
	} | null>(null);

	function change(action: SplitAction) {
		setSaved(null);
		dispatch(action);
	}

	async function loadFile(picked: File) {
		dispatch({ type: "loadStart", file: picked });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file: picked }, (thumbnail) =>
				dispatch({ type: "addThumbnail", thumbnail }),
			),
		);

		const result = toastOnExit(exit, m.pdf_open_failed());

		if (Option.isNone(result)) {
			dispatch({ type: "reset" });

			return;
		}

		dispatch({ type: "loadSuccess", pageCount: result.value.pageCount });
	}

	const handoff = useHandoff(handleFiles, { hasFile: state.file !== null });

	function handleFiles(files: FileList | null) {
		const picked = files?.[0];

		if (picked) void loadFile(picked);
	}

	async function runExtract() {
		if (!state.file || state.selected.size === 0) return;
		const pageIndices = [...state.selected].sort((a, b) => a - b);
		dispatch({ type: "workStart" });

		const exit = await Effect.runPromiseExit(
			extractPages({ id: crypto.randomUUID(), file: state.file, pageIndices }),
		);

		dispatch({ type: "workEnd" });

		const result = toastOnExit(exit, m.pdfsplit_extract_failed());

		if (Option.isNone(result)) return;
		recordToolUse("/pdf-split");
		const name = `${baseName(state.file.name)}_extracted.pdf`;
		downloadBlob(result.value, name);
		setSaved({
			from: state.file,
			file: {
				blob: result.value,
				name,
				detail: `${pagesLabel(pageIndices.length)} · ${formatBytes(result.value.size)}`,
				outputs: [{ blob: result.value, name }],
			},
		});
	}

	async function runSplit(parts: ReadonlyArray<SplitPart>) {
		if (!state.file || parts.length === 0) return;
		dispatch({ type: "workStart" });

		const exit = await Effect.runPromiseExit(
			splitPdf({ id: crypto.randomUUID(), file: state.file, parts }),
		);

		dispatch({ type: "workEnd" });

		const result = toastOnExit(exit, m.pdfsplit_split_failed());

		if (Option.isNone(result)) return;
		recordToolUse("/pdf-split");
		const name = `${baseName(state.file.name)}_split.zip`;
		downloadBlob(result.value, name);
		setSaved({
			from: state.file,
			file: {
				blob: result.value,
				name,
				detail: `${filesLabel(parts.length)} · ${formatBytes(result.value.size)}`,
				outputs: zippedOutputs(result.value, "application/pdf", parts.length),
			},
		});
	}

	const hasDocument = state.file !== null;
	const ready = hasDocument && !state.rendering;
	const selectable = state.mode === "extract" && ready;

	return (
		<PageShell width="wide">
			<PageHeader
				title={m.tool_pdf_split_label()}
				actions={
					hasDocument && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => dispatch({ type: "reset" })}
						>
							<RotateCcw />
							{m.common_choose_another()}
						</Button>
					)
				}
			>
				{m.pdfsplit_description()}{" "}
				{m.pdf_description_limits({
					mb: Math.round(MAX_PDF_BYTES / MB),
					pages: MAX_PDF_PAGES,
				})}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			{!hasDocument && (
				<Dropzone
					label={m.pdf_dropzone_label()}
					actionLabel={m.common_choose_file()}
					hint={m.pdf_hint({
						mb: Math.round(MAX_PDF_BYTES / MB),
						pages: MAX_PDF_PAGES,
					})}
					accept="application/pdf"
					ariaLabel={m.pdfsplit_dropzone_aria()}
					onFiles={handleFiles}
				/>
			)}

			{state.file !== null && (
				<div>
					<div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
						<span className="truncate font-medium text-foreground">
							{state.file.name}
						</span>
						{state.rendering ? (
							<span className="inline-flex items-center gap-1.5">
								<Loader2 className="size-3.5 animate-spin" />
								{m.pdf_rendering({ count: state.thumbnails.length })}
							</span>
						) : (
							<span>{pagesLabel(state.pageCount)}</span>
						)}
					</div>

					<SplitControls
						mode={state.mode}
						onModeChange={(mode) => change({ type: "setMode", mode })}
						ready={ready}
						working={state.working}
						selectedCount={state.selected.size}
						pageCount={state.pageCount}
						everyN={state.everyN}
						onEveryNChange={(value) => change({ type: "setEveryN", value })}
						onClearSelected={() => change({ type: "clearSelected" })}
						onSelectAll={() => change({ type: "selectAll" })}
						onExtract={runExtract}
						onSplitEveryN={() =>
							state.file &&
							runSplit(
								everyNPageParts(state.pageCount, state.everyN, state.file.name),
							)
						}
						onSplitAll={() =>
							state.file &&
							runSplit(allIndividualParts(state.pageCount, state.file.name))
						}
					/>

					{saved?.from === state.file && (
						<div className="mt-4">
							<SavedResult from="pdf_split" saved={saved.file} />
						</div>
					)}

					<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{state.thumbnails.map((thumbnail) => (
							<PageThumbnail
								key={thumbnail.index}
								thumbnail={thumbnail}
								selectable={selectable}
								selected={state.selected.has(thumbnail.index)}
								onToggle={() =>
									change({ type: "toggle", index: thumbnail.index })
								}
							/>
						))}
					</div>
				</div>
			)}
		</PageShell>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Loader2, RotateCcw } from "lucide-react";
import { useReducer } from "react";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { PageThumbnail } from "#/components/pdf-split/page-thumbnail.tsx";
import { SplitControls } from "#/components/pdf-split/split-controls.tsx";
import {
	initialSplitState,
	splitReducer,
} from "#/components/pdf-split/state.ts";
import { Button } from "#/components/ui/button.tsx";
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
import { seoHead } from "#/lib/seo.ts";

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

	async function loadFile(picked: File) {
		dispatch({ type: "loadStart", file: picked });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file: picked }, (thumbnail) =>
				dispatch({ type: "addThumbnail", thumbnail }),
			),
		);

		const result = toastOnExit(exit, "Couldn't open this PDF.");

		if (Option.isNone(result)) {
			dispatch({ type: "reset" });

			return;
		}

		dispatch({ type: "loadSuccess", pageCount: result.value.pageCount });
	}

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

		const result = toastOnExit(exit, "Couldn't extract those pages.");

		if (Option.isNone(result)) return;
		downloadBlob(result.value, `${baseName(state.file.name)}_extracted.pdf`);
	}

	async function runSplit(parts: ReadonlyArray<SplitPart>) {
		if (!state.file || parts.length === 0) return;
		dispatch({ type: "workStart" });

		const exit = await Effect.runPromiseExit(
			splitPdf({ id: crypto.randomUUID(), file: state.file, parts }),
		);

		dispatch({ type: "workEnd" });

		const result = toastOnExit(exit, "Couldn't split this PDF.");

		if (Option.isNone(result)) return;
		downloadBlob(result.value, `${baseName(state.file.name)}_split.zip`);
	}

	const hasDocument = state.file !== null;
	const ready = hasDocument && !state.rendering;
	const selectable = state.mode === "extract" && ready;

	return (
		<PageShell width="wide">
			<PageHeader
				title="Split PDF"
				actions={
					hasDocument && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => dispatch({ type: "reset" })}
						>
							<RotateCcw />
							Choose another
						</Button>
					)
				}
			>
				Open a PDF to see every page, then split it, entirely in your browser.
				Up to {Math.round(MAX_PDF_BYTES / MB)} MB and {MAX_PDF_PAGES} pages.
			</PageHeader>

			{!hasDocument && (
				<Dropzone
					label="Drag & drop a PDF here, or"
					actionLabel="Choose file"
					hint={`PDF up to ${Math.round(MAX_PDF_BYTES / MB)} MB and ${MAX_PDF_PAGES} pages`}
					accept="application/pdf"
					ariaLabel="Choose a PDF to split"
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
								Rendering pages… {state.thumbnails.length}
							</span>
						) : (
							<span>
								{state.pageCount} {state.pageCount === 1 ? "page" : "pages"}
							</span>
						)}
					</div>

					<SplitControls
						mode={state.mode}
						onModeChange={(mode) => dispatch({ type: "setMode", mode })}
						ready={ready}
						working={state.working}
						selectedCount={state.selected.size}
						pageCount={state.pageCount}
						everyN={state.everyN}
						onEveryNChange={(value) => dispatch({ type: "setEveryN", value })}
						onClearSelected={() => dispatch({ type: "clearSelected" })}
						onSelectAll={() => dispatch({ type: "selectAll" })}
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

					<div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
						{state.thumbnails.map((thumbnail) => (
							<PageThumbnail
								key={thumbnail.index}
								thumbnail={thumbnail}
								selectable={selectable}
								selected={state.selected.has(thumbnail.index)}
								onToggle={() =>
									dispatch({ type: "toggle", index: thumbnail.index })
								}
							/>
						))}
					</div>
				</div>
			)}
		</PageShell>
	);
}

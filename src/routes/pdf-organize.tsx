import { createFileRoute } from "@tanstack/react-router";
import { Effect, Option } from "effect";
import { Download, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { useReducer } from "react";

import { downloadBlob } from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { PageGrid } from "#/components/pdf-organize/page-grid.tsx";
import {
	initialOrganizeState,
	organizeReducer,
} from "#/components/pdf-organize/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { MAX_PDF_BYTES, MAX_PDF_PAGES } from "#/lib/file/pdf-types.ts";
import { extractPages, loadPdf } from "#/lib/file/pdf.ts";

export const Route = createFileRoute("/pdf-organize")({
	component: PdfOrganizePage,
});

const MB = 1024 * 1024;

function PdfOrganizePage() {
	const [state, dispatch] = useReducer(organizeReducer, initialOrganizeState);

	async function loadFile(file: File) {
		dispatch({ type: "loadStart", file });

		const exit = await Effect.runPromiseExit(
			loadPdf({ id: crypto.randomUUID(), file }, (thumbnail) =>
				dispatch({ type: "addThumbnail", thumbnail }),
			),
		);

		const result = toastOnExit(exit, "Couldn't open this PDF.");

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
		const result = toastOnExit(exit, "Couldn't save this PDF.");

		if (Option.isNone(result)) return;
		downloadBlob(
			result.value,
			`${state.file.name.replace(/\.pdf$/i, "")}_organized.pdf`,
		);
	}

	const busy = state.rendering || state.saving;
	const total = state.loaded.length;
	const kept = state.pages.length;

	const changed =
		kept !== total ||
		state.pages.some((p, i) => p.sourceIndex !== i || p.rotation !== 0);

	return (
		<PageShell width="wide">
			<PageHeader
				title="Organize PDF"
				actions={
					state.file && (
						<Button
							variant="outline"
							size="sm"
							onClick={() => dispatch({ type: "reset" })}
							disabled={state.saving}
						>
							<RotateCcw />
							Choose another
						</Button>
					)
				}
			>
				Rotate, delete and reorder the pages of a PDF, entirely in your browser.
				Up to {Math.round(MAX_PDF_BYTES / MB)} MB and {MAX_PDF_PAGES} pages.
			</PageHeader>

			{!state.file && (
				<Dropzone
					label="Drag & drop a PDF here, or"
					actionLabel="Choose file"
					hint={`PDF up to ${Math.round(MAX_PDF_BYTES / MB)} MB and ${MAX_PDF_PAGES} pages`}
					accept="application/pdf"
					ariaLabel="Choose a PDF to organize"
					onFiles={(files) => {
						const picked = files?.[0];

						if (picked) void loadFile(picked);
					}}
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
									Rendering pages… {total}
								</span>
							) : (
								`${kept} of ${total} ${total === 1 ? "page" : "pages"}`
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
								Restore all
							</Button>
							<Button onClick={save} disabled={busy || kept === 0}>
								{state.saving ? (
									<Loader2 className="animate-spin" />
								) : (
									<Download />
								)}
								Save PDF
							</Button>
						</div>
					</div>

					{kept === 0 && !state.rendering ? (
						<p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
							Every page is deleted. Use Restore all to bring them back.
						</p>
					) : (
						<PageGrid pages={state.pages} disabled={busy} dispatch={dispatch} />
					)}
				</div>
			)}
		</PageShell>
	);
}

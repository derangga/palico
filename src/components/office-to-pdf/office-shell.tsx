import { Cause, Effect, Option, Exit } from "effect";
import { FileArchive, Loader2, UploadCloud } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { FileRow } from "#/components/office-to-pdf/file-row.tsx";
import type { OfficeItem } from "#/components/office-to-pdf/types.ts";
import {
	downloadBlob,
	pdfName,
	saveOne,
} from "#/components/office-to-pdf/utils.ts";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { checkOfficeFile } from "#/lib/file/office-limits.ts";
import {
	MAX_BATCH_FILES,
	MAX_OFFICE_BYTES,
	MB,
	OFFICE_ACCEPT,
} from "#/lib/file/office-types.ts";
import { filesLabel } from "#/lib/i18n/counts.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export function OfficeShell() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [items, setItems] = useState<ReadonlyArray<OfficeItem>>([]);
	const [converting, setConverting] = useState(false);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchDone, setBatchDone] = useState(0);

	// Items still needing conversion (fresh or previously failed).
	const convertable = items.filter(
		(i) => i.status === "ready" || i.status === "error",
	);

	const doneItems = items.filter((i) => i.status === "done" && i.outBlob);

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: File[] = [];

		for (const file of Array.from(fileList)) {
			const check = checkOfficeFile({ name: file.name, size: file.size });

			if (check.kind === "unsupported") {
				toast.error(m.office_unsupported_toast({ name: file.name }));
				continue;
			}

			if (check.kind === "too-large") {
				toast.error(
					m.office_over_limit({
						name: file.name,
						limit: Math.round(MAX_OFFICE_BYTES / MB),
					}),
				);
				continue;
			}

			accepted.push(file);
		}

		const room = Math.max(MAX_BATCH_FILES - items.length, 0);

		if (accepted.length > room) {
			toast.error(m.error_office_too_many({ limit: MAX_BATCH_FILES }));
		}

		const taken = accepted.slice(0, room);

		if (taken.length === 0) return;

		setItems((prev) => [
			...prev,
			...taken.map((file): OfficeItem => ({
				id: crypto.randomUUID(),
				file,
				status: "ready",
			})),
		]);
	}

	function removeItem(id: string) {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}

	function reset() {
		setItems([]);
		setConverting(false);
	}

	// Convert every convertable item sequentially (the engine is single-threaded
	// and converts one document at a time), streaming per-item status. Nothing is
	// auto-downloaded — the user then saves items individually or as a zip.
	async function runConvert() {
		const targets = items.filter(
			(i) => i.status === "ready" || i.status === "error",
		);

		if (targets.length === 0 || converting) return;
		setConverting(true);
		setBatchTotal(targets.length);
		setBatchDone(0);
		setItems((prev) =>
			prev.map((it) =>
				it.status === "ready" || it.status === "error"
					? { ...it, status: "converting", message: undefined }
					: it,
			),
		);

		const { convertFileToPdf } = await import("#/lib/file/office.ts");

		let ok = 0;
		let failed = 0;

		for (const target of targets) {
			// Sequential by design: the LibreOffice engine is single-threaded and
			// converts one document at a time — running these together would corrupt
			// the shared engine state, so Promise.all is not an option here.
			// react-doctor-disable-next-line react-doctor/async-await-in-loop
			const exit = await Effect.runPromiseExit(
				withBusy(convertFileToPdf({ id: target.id, file: target.file })),
			);

			if (Exit.isSuccess(exit)) {
				ok += 1;
				const blob = exit.value;
				setItems((prev) =>
					prev.map((it) =>
						it.id === target.id
							? {
									...it,
									status: "done",
									outBlob: blob,
									outName: pdfName(target.file.name),
									outSize: blob.size,
									message: undefined,
								}
							: it,
					),
				);
			} else {
				failed += 1;

				const failure = Option.getOrUndefined(
					Cause.findErrorOption(exit.cause),
				);

				if (failure) console.error(failure);
				setItems((prev) =>
					prev.map((it) =>
						it.id === target.id
							? {
									...it,
									status: "error",
									message: failure?.message ?? m.office_conversion_failed(),
								}
							: it,
					),
				);
			}

			setBatchDone((n) => n + 1);
		}

		setConverting(false);

		if (ok > 0) {
			recordToolUse("/office-to-pdf");
			toast.success(
				ok === 1
					? m.office_success_one({ count: ok })
					: m.office_success_other({ count: ok }),
			);
		}

		if (failed > 0) {
			toast.error(
				failed === 1
					? m.office_failed_one({ count: failed })
					: m.office_failed_other({ count: failed }),
			);
		}
	}

	async function downloadAllZip() {
		if (doneItems.length === 0) return;
		const { zipPdfs } = await import("#/lib/file/office.ts");

		const exit = await Effect.runPromiseExit(
			zipPdfs(
				doneItems.flatMap((it) =>
					it.outBlob
						? [{ name: it.outName ?? pdfName(it.file.name), blob: it.outBlob }]
						: [],
				),
			),
		);

		const result = toastOnExit(exit, m.common_zip_failed());

		if (Option.isNone(result)) return;
		downloadBlob(result.value, "converted-pdfs.zip");
		toast.success(m.office_zip_done());
	}

	const hasItems = items.length > 0;

	return (
		<PageShell>
			<PageHeader title={m.tool_office_to_pdf_label()}>
				{m.office_description({
					mb: Math.round(MAX_OFFICE_BYTES / MB),
					max: MAX_BATCH_FILES,
				})}
			</PageHeader>

			{/* The dropzone wraps a real file input. */}
			<div
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					addFiles(e.dataTransfer.files);
				}}
				className="rounded-xl border border-dashed bg-card p-8 text-center"
			>
				<UploadCloud className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">{m.office_dropzone_label()}</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					onClick={() => fileInputRef.current?.click()}
				>
					{m.common_choose_files()}
				</Button>
				<input
					id={inputId}
					ref={fileInputRef}
					type="file"
					accept={OFFICE_ACCEPT}
					multiple
					aria-label={m.office_dropzone_aria()}
					className="hidden"
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = "";
					}}
				/>
			</div>

			{hasItems && (
				<>
					{/* Actions */}
					<div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
						<p className="text-sm text-muted-foreground">
							{filesLabel(items.length)}
							{doneItems.length > 0 &&
								` · ${m.office_converted_count({ count: doneItems.length })}`}
						</p>
						<div className="ml-auto flex gap-2">
							<Button variant="ghost" onClick={reset} disabled={converting}>
								{m.common_clear()}
							</Button>
							{doneItems.length > 1 && (
								<Button
									variant="outline"
									onClick={downloadAllZip}
									disabled={converting}
								>
									<FileArchive />
									{m.common_download_all_zip()}
								</Button>
							)}
							{convertable.length > 0 && (
								<Button onClick={runConvert} disabled={converting}>
									{converting ? <Loader2 className="animate-spin" /> : null}
									{converting
										? m.converter_converting({
												done: batchDone,
												total: batchTotal,
											})
										: m.converter_convert_count({ count: convertable.length })}
								</Button>
							)}
						</div>
					</div>

					{/* File list */}
					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<FileRow
								key={item.id}
								item={item}
								converting={converting}
								onRemove={() => removeItem(item.id)}
								onSave={() => saveOne(item)}
							/>
						))}
					</ul>
				</>
			)}
		</PageShell>
	);
}

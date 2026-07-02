import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	CheckCircle2,
	CircleAlert,
	Download,
	FileArchive,
	FileText,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { DownloadConsentDialog } from "#/components/download-consent-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { checkOfficeFile } from "#/lib/file/office-limits.ts";
import {
	isEngineCached,
	type LoadPhase,
	MAX_BATCH_FILES,
	MAX_OFFICE_BYTES,
	MB,
	OFFICE_ACCEPT,
	OFFICE_ENGINE_SIZE_LABEL,
} from "#/lib/file/office-types.ts";

export const Route = createFileRoute("/office-to-pdf")({
	component: OfficeToPdfPage,
});

function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / MB).toFixed(2)} MB`;
}

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

// --- Engine gate (mirrors the video converter) ------------------------------

function OfficeToPdfPage() {
	const [phase, setPhase] = useState<LoadPhase>({ kind: "checking" });
	const [declined, setDeclined] = useState(false);

	const startLoad = useCallback(async () => {
		setDeclined(false);
		setPhase({ kind: "downloading", percent: 0 });
		try {
			// Dynamic import keeps the office runtime out of the route bundle until
			// the user opts into the one-time engine download.
			const { loadEngine } = await import("#/lib/file/office-engine.ts");
			await Effect.runPromise(loadEngine((next) => setPhase(next)));
		} catch (err) {
			setPhase({
				kind: "error",
				message:
					err instanceof Error
						? err.message
						: "Could not load the office engine.",
			});
		}
	}, []);

	// On mount: peek the Cache API. If the engine is already cached, skip the
	// consent dialog and go straight to preparing.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cached = await Effect.runPromise(isEngineCached);
			if (cancelled) return;
			if (cached) void startLoad();
			else setPhase({ kind: "consent" });
		})();
		return () => {
			cancelled = true;
		};
	}, [startLoad]);

	return (
		<>
			{/* LibreOffice's Qt runtime requires this element to exist before the
			    engine boots (ZetaHelperMain reads #qtcanvas). Keep it mounted across
			    every phase, including the ready shell. Hidden — we convert headless. */}
			<canvas id="qtcanvas" className="hidden" />
			{phase.kind === "ready" ? (
				<OfficeShell />
			) : (
				<div className="mx-auto w-full max-w-3xl px-6 py-10">
					<div className="mb-6">
						<h1 className="text-2xl font-bold">Word to PDF</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Convert Word, OpenDocument, and RTF files to PDF — entirely in
							your browser. Nothing is uploaded.
						</p>
					</div>
					<EnginePanel
						phase={phase}
						declined={declined}
						onStart={startLoad}
						onDecline={() => setDeclined(true)}
					/>
				</div>
			)}
		</>
	);
}

interface EnginePanelProps {
	phase: LoadPhase;
	declined: boolean;
	onStart: () => void;
	onDecline: () => void;
}

function EnginePanel({
	phase,
	declined,
	onStart,
	onDecline,
}: EnginePanelProps) {
	const dialogOpen = phase.kind === "consent" && !declined;

	if (phase.kind === "error") {
		return (
			<div className="rounded-xl border border-destructive/30 bg-card p-6">
				<div className="flex items-start gap-3">
					<CircleAlert className="size-5 shrink-0 text-destructive" />
					<div className="flex-1">
						<p className="text-sm font-medium">Could not load the engine</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{phase.message}
						</p>
						<Button className="mt-4" onClick={onStart}>
							Try again
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (phase.kind === "checking" || (phase.kind === "consent" && !declined)) {
		return (
			<>
				<EnginePlaceholder
					title="Preparing office tools"
					body="Checking for a cached engine…"
				/>
				<DownloadConsentDialog
					open={dialogOpen}
					onOpenChange={(open) => {
						if (!open) onDecline();
					}}
					onConfirm={onStart}
					icon={<FileText />}
					title={`Download the office engine (${OFFICE_ENGINE_SIZE_LABEL})`}
					description={
						<>
							Conversion runs entirely on your device using LibreOffice compiled
							to WebAssembly, a one-time {OFFICE_ENGINE_SIZE_LABEL} download. It
							is cached after the first load, so return visits are instant.
							Nothing leaves your browser.
						</>
					}
				/>
			</>
		);
	}

	if (phase.kind === "consent" && declined) {
		return (
			<div className="rounded-xl border border-dashed bg-card p-8 text-center">
				<FileText className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">
					Office conversion is disabled
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					The {OFFICE_ENGINE_SIZE_LABEL} engine download is required to use this
					tool.
				</p>
				<Button className="mt-4" onClick={onStart}>
					<Download />
					Enable office conversion
				</Button>
			</div>
		);
	}

	// Loading phases: downloading → caching → preparing.
	const status =
		phase.kind === "downloading"
			? `Downloading engine ${phase.percent}%`
			: phase.kind === "caching"
				? "Caching engine"
				: "Preparing tools";
	const percent = phase.kind === "downloading" ? phase.percent : 100;

	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
				<p className="text-sm font-medium">{status}</p>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-primary transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				{phase.kind === "downloading"
					? "Fetching the engine. It will be cached for next time."
					: phase.kind === "caching"
						? "Saving the engine to your browser cache."
						: "Initializing LibreOffice (1–3s)."}
			</p>
		</div>
	);
}

function EnginePlaceholder({ title, body }: { title: string; body: string }) {
	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
				<div>
					<p className="text-sm font-medium">{title}</p>
					<p className="mt-1 text-xs text-muted-foreground">{body}</p>
				</div>
			</div>
		</div>
	);
}

// --- Conversion shell -------------------------------------------------------

type ItemStatus = "ready" | "converting" | "done" | "error";

type OfficeItem = {
	readonly id: string;
	readonly file: File;
	status: ItemStatus;
	outBlob?: Blob;
	outName?: string;
	outSize?: number;
	message?: string;
};

function OfficeShell() {
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
				toast.error(`"${file.name}" isn't a supported Office document.`);
				continue;
			}
			if (check.kind === "too-large") {
				toast.error(
					`"${file.name}" is over the ${Math.round(MAX_OFFICE_BYTES / MB)} MB limit.`,
				);
				continue;
			}
			accepted.push(file);
		}

		const room = Math.max(MAX_BATCH_FILES - items.length, 0);
		if (accepted.length > room) {
			toast.error(`You can convert up to ${MAX_BATCH_FILES} files at a time.`);
		}
		const taken = accepted.slice(0, room);
		if (taken.length === 0) return;

		setItems((prev) => [
			...prev,
			...taken.map((file) => ({
				id: crypto.randomUUID(),
				file,
				status: "ready" as ItemStatus,
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
				convertFileToPdf({ id: target.id, file: target.file }),
			);
			if (exit._tag === "Success") {
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
				const failure =
					exit.cause._tag === "Fail" ? exit.cause.error : undefined;
				if (failure) console.error(failure);
				setItems((prev) =>
					prev.map((it) =>
						it.id === target.id
							? {
									...it,
									status: "error",
									message: failure?.message ?? "Conversion failed.",
								}
							: it,
					),
				);
			}
			setBatchDone((n) => n + 1);
		}

		setConverting(false);
		if (ok > 0) {
			toast.success(`Converted ${ok} file${ok === 1 ? "" : "s"} to PDF.`);
		}
		if (failed > 0) {
			toast.error(
				`${failed} file${failed === 1 ? "" : "s"} couldn't be converted.`,
			);
		}
	}

	async function downloadAllZip() {
		if (doneItems.length === 0) return;
		const { zipPdfs } = await import("#/lib/file/office.ts");
		const exit = await Effect.runPromiseExit(
			zipPdfs(
				doneItems.map((it) => ({
					name: it.outName ?? pdfName(it.file.name),
					blob: it.outBlob as Blob,
				})),
			),
		);
		if (exit._tag !== "Success") {
			toast.error("Could not build the zip file.");
			return;
		}
		downloadBlob(exit.value, "converted-pdfs.zip");
		toast.success("Downloaded all PDFs as a zip.");
	}

	const hasItems = items.length > 0;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Word to PDF</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert Word (.docx, .doc), OpenDocument (.odt), and RTF files to PDF
					— entirely in your browser. Each file up to{" "}
					{Math.round(MAX_OFFICE_BYTES / MB)} MB; up to {MAX_BATCH_FILES} at a
					time.
				</p>
			</div>

			{/* biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input. */}
			<div
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					addFiles(e.dataTransfer.files);
				}}
				className="rounded-xl border border-dashed bg-card p-8 text-center"
			>
				<UploadCloud className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">
					Drag &amp; drop documents here, or
				</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					onClick={() => fileInputRef.current?.click()}
				>
					Choose files
				</Button>
				<input
					id={inputId}
					ref={fileInputRef}
					type="file"
					accept={OFFICE_ACCEPT}
					multiple
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
							{items.length} {items.length === 1 ? "file" : "files"}
							{doneItems.length > 0 && ` · ${doneItems.length} converted`}
						</p>
						<div className="ml-auto flex gap-2">
							<Button variant="ghost" onClick={reset} disabled={converting}>
								Clear
							</Button>
							{doneItems.length > 1 && (
								<Button
									variant="outline"
									onClick={downloadAllZip}
									disabled={converting}
								>
									<FileArchive />
									Download all (.zip)
								</Button>
							)}
							{convertable.length > 0 && (
								<Button onClick={runConvert} disabled={converting}>
									{converting ? <Loader2 className="animate-spin" /> : null}
									{converting
										? `Converting ${batchDone} / ${batchTotal}`
										: `Convert ${convertable.length}`}
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
		</div>
	);
}

function FileRow({
	item,
	converting,
	onRemove,
	onSave,
}: {
	item: OfficeItem;
	converting: boolean;
	onRemove: () => void;
	onSave: () => void;
}) {
	return (
		<li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
			<FileText className="size-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (PDF)`}
					{item.status === "error" && item.message && (
						<span className="text-destructive"> — {item.message}</span>
					)}
				</p>
			</div>
			<StatusBadge status={item.status} />
			{item.status === "done" && item.outBlob && (
				<Button variant="ghost" size="sm" onClick={onSave}>
					<Download />
					Save
				</Button>
			)}
			{!converting && (
				<button
					type="button"
					onClick={onRemove}
					className="text-muted-foreground hover:text-foreground"
					aria-label={`Remove ${item.file.name}`}
				>
					<X className="size-4" />
				</button>
			)}
		</li>
	);
}

function StatusBadge({ status }: { status: ItemStatus }) {
	if (status === "converting")
		return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
	if (status === "done")
		return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
	if (status === "error")
		return <CircleAlert className="size-4 shrink-0 text-destructive" />;
	return null;
}

function saveOne(item: OfficeItem) {
	if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
}

function pdfName(fileName: string) {
	const dot = fileName.lastIndexOf(".");
	const base = dot > 0 ? fileName.slice(0, dot) : fileName;
	return `${base}.pdf`;
}

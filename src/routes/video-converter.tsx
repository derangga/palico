import { createFileRoute } from "@tanstack/react-router";
import { Effect, Either } from "effect";
import {
	Ban,
	CheckCircle2,
	CircleAlert,
	Clock,
	Download,
	Film,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import {
	checkFileSize,
	classifyDevice,
	estimateMinutes,
	MAX_FILES,
	MB,
	processTimeWarningLevel,
} from "#/lib/video/limits.ts";
import {
	getSuppressSmallWarning,
	setSuppressSmallWarning,
} from "#/lib/video/preferences.ts";
import {
	parseVideoOutputFormat,
	VIDEO_OUTPUT_FORMATS,
	type VideoOutputFormat,
} from "#/lib/video/types.ts";

export const Route = createFileRoute("/video-converter")({
	component: VideoConverterPage,
});

type ItemStatus = "ready" | "processing" | "done" | "error";

interface Item {
	id: string;
	file: File;
	status: ItemStatus;
	percent?: number;
	outBlob?: Blob;
	outName?: string;
	outSize?: number;
	outLabel?: string;
	message?: string;
}

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

// Pure save helper — no local state, so it lives at module scope rather than
// being rebuilt on every ConverterShell render.
function handleSaveOne(item: Item) {
	if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
}

// Static consent copy — hoisted to module scope so it isn't rebuilt each render
// and doesn't force VideoEnginePanel to redraw.
const CONVERTER_CONSENT_DESCRIPTION = (
	<>
		Video conversion runs entirely on your device, but the engine itself is a
		one-time {ENGINE_SIZE_LABEL} download. It is cached after the first load, so
		return visits are instant. Nothing leaves your browser.
	</>
);

// Reads client globals and delegates to the pure classifier. Only ever called
// from user-event handlers, so navigator/window are safe (no SSR access).
function deviceClass() {
	return classifyDevice({
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
	});
}

function VideoConverterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") {
		return <ConverterShell />;
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Converter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert videos to MP4, WebM, MOV, MKV, or AVI, entirely in your
					browser.
				</p>
			</div>

			<VideoEnginePanel
				phase={gate.phase}
				declined={gate.declined}
				onStart={gate.startLoad}
				onDecline={gate.decline}
				icon={Film}
				consentDescription={CONVERTER_CONSENT_DESCRIPTION}
				disabledTitle="Video conversion is disabled"
				enableLabel="Enable video conversion"
			/>
		</div>
	);
}

function ConverterShell() {
	const inputId = useId();
	const formatLabelId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [items, setItems] = useState<Item[]>([]);
	const [format, setFormat] = useState<VideoOutputFormat>("mp4");
	const [isRunning, setIsRunning] = useState(false);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchDone, setBatchDone] = useState(0);
	// Process-time warning dialog: `pending` holds the targets awaiting the
	// user's confirmation; null means no dialog is open.
	const [pending, setPending] = useState<Item[] | null>(null);
	const [dontShowAgain, setDontShowAgain] = useState(false);
	// Cancellation: `confirmCancel` opens the confirm dialog; `cancelling`
	// disables the button during the terminate window (guards double-terminate
	// / button-mashing). The mutable token is read by the running batch via a
	// closure so it can short-circuit once cancellation is signalled.
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: Item[] = [];

		const device = deviceClass();

		for (const file of Array.from(fileList)) {
			if (!file.type.startsWith("video/")) {
				toast.error(`"${file.name}" is not a video.`);
				continue;
			}

			const verdict = checkFileSize(file.size, device);
			if (verdict.kind === "rejected") {
				// Rejected files never enter the queue, so conversion never runs
				// on them — no engine work is triggered.
				toast.error(
					`"${file.name}" is ${formatBytes(file.size)} — over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB; for larger files, please use a desktop video editor.`,
				);
				continue;
			}
			if (verdict.kind === "warn") {
				toast(
					`"${file.name}" is ${formatBytes(file.size)}. This may take several minutes to convert.`,
				);
			}

			accepted.push({
				// Random id: name/size/mtime collide when the same file is added in
				// two separate drops, which breaks React keys and progress routing.
				id: crypto.randomUUID(),
				file,
				status: "ready",
			});
		}

		if (accepted.length > 0) {
			const room = Math.max(MAX_FILES - items.length, 0);
			if (accepted.length > room) {
				toast.error(`You can convert up to ${MAX_FILES} videos at a time.`);
			}
			setItems((prev) => [...prev, ...accepted.slice(0, room)]);
		}
	}

	function removeItem(id: string) {
		setItems((prev) => prev.filter((item) => item.id !== id));
	}

	function reset() {
		setItems([]);
	}

	function changeFormat(value: VideoOutputFormat) {
		setFormat(value);
		// Completed/failed items become re-convertable when the target format
		// changes, mirroring the image converter UX.
		setItems((prev) =>
			prev.map((item) =>
				item.status === "done" || item.status === "error"
					? {
							...item,
							status: "ready",
							percent: undefined,
							outBlob: undefined,
							outName: undefined,
							outSize: undefined,
							outLabel: undefined,
							message: undefined,
						}
					: item,
			),
		);
	}

	// Decide whether the process-time dialog must gate this conversion, based
	// on the largest queued file:
	//   "always"      → ≥50MB, show regardless of preference
	//   "suppressible" → 20–50MB, show unless the user opted out
	//   "none"         → <20MB, convert immediately
	function handleConvert() {
		const targets = items.filter(
			(i) => i.status === "ready" || i.status === "error",
		);
		if (targets.length === 0) return;

		const largest = Math.max(...targets.map((t) => t.file.size));
		const level = processTimeWarningLevel(largest);

		if (level === "none") {
			void runConversion(targets);
			return;
		}
		if (level === "suppressible") {
			const suppressed = Effect.runSync(getSuppressSmallWarning);
			if (suppressed) {
				void runConversion(targets);
				return;
			}
		}

		setDontShowAgain(false);
		setPending(targets);
	}

	function confirmPending() {
		const targets = pending;
		setPending(null);
		if (!targets) return;
		if (dontShowAgain) Effect.runSync(setSuppressSmallWarning(true));
		void runConversion(targets);
	}

	async function runConversion(targets: Item[]) {
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		setIsRunning(true);
		setBatchTotal(targets.length);
		setBatchDone(0);

		const meta = VIDEO_OUTPUT_FORMATS.find((f) => f.value === format);
		const formatLabel = meta?.label ?? format.toUpperCase();
		const inputs = targets.map((item) => ({
			id: item.id,
			file: item.file,
			format,
		}));

		try {
			// Dynamic import keeps @ffmpeg/* out of the route bundle. Engine.ts
			// holds the loaded singleton; converter.ts calls into it.
			// loadEngine is idempotent — a no-op when the engine is already
			// loaded, and a fast cache-backed re-init after a prior cancel
			// terminated the worker.
			// Await-before-guard is intentional: the guard below catches a cancel
			// that lands during the (potentially slow) engine load, so the await
			// must run before it — not after.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));
			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { convertVideos } = await import("#/lib/video/converter.ts");

			const outputs = await Effect.runPromise(
				convertVideos(
					inputs,
					(update) => {
						setItems((prev) =>
							prev.map((item) => {
								if (item.id !== update.id) return item;
								if (update.status === "processing") {
									return {
										...item,
										status: "processing",
										percent: update.percent,
										message: undefined,
									};
								}
								if (update.status === "done") {
									return {
										...item,
										status: "done",
										percent: 100,
										outBlob: update.output.blob,
										outName: update.output.name,
										outSize: update.output.size,
										outLabel: formatLabel,
										message: undefined,
									};
								}
								return {
									...item,
									status: "error",
									percent: undefined,
									message: update.error.message,
								};
							}),
						);
						if (update.status === "done" || update.status === "error") {
							setBatchDone((n) => n + 1);
						}
					},
					() => token.cancelled,
				),
			);

			// A cancel that landed while the batch was draining owns the UI
			// reset — don't clobber it with success/failure toasts.
			if (token.cancelled) return;

			const ok = outputs.length;
			const failed = inputs.length - ok;
			if (ok > 0) {
				toast.success(
					`Converted ${ok} video${ok === 1 ? "" : "s"} to ${formatLabel}.`,
				);
			}
			if (failed > 0) {
				toast.error(
					`${failed} video${failed === 1 ? "" : "s"} could not be converted.`,
				);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Video conversion failed unexpectedly.",
			);
		} finally {
			if (!token.cancelled) setIsRunning(false);
		}
	}

	// Confirmed cancellation: kill the worker (terminate() rejects the in-flight
	// exec, which the pipeline catches), then reset queued/in-flight rows to
	// "ready" while keeping any already-finished downloads. The next Convert
	// re-inits the engine from cache.
	async function cancelConversion() {
		cancelTokenRef.current.cancelled = true;
		setConfirmCancel(false);
		setCancelling(true);
		try {
			const { disposeEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(disposeEngine);
		} finally {
			setItems((prev) =>
				prev.map((item) =>
					item.status === "processing" || item.status === "ready"
						? {
								...item,
								status: "ready",
								percent: undefined,
								message: undefined,
							}
						: item,
				),
			);
			setBatchTotal(0);
			setBatchDone(0);
			setIsRunning(false);
			setCancelling(false);
		}
	}

	const convertable = items.filter(
		(i) => i.status === "ready" || i.status === "error",
	);

	const convertLabel = isRunning
		? `Converting ${batchDone} / ${batchTotal}`
		: convertable.length <= 1
			? "Convert"
			: `Convert ${convertable.length} files`;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Converter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert videos to MP4, WebM, MOV, MKV, or AVI, entirely in your
					browser. Files convert one at a time to keep memory in check, up to{" "}
					{MAX_FILES} per batch.
				</p>
			</div>

			{/* Dropzone */}
			{/** biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input. */}
			<div
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => {
					e.preventDefault();
					if (isRunning) return;
					addFiles(e.dataTransfer.files);
				}}
				className="rounded-xl border border-dashed bg-card p-8 text-center"
			>
				<UploadCloud className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">
					Drag &amp; drop videos here, or
				</p>
				<Button
					variant="outline"
					size="sm"
					className="mt-3"
					disabled={isRunning}
					onClick={() => fileInputRef.current?.click()}
				>
					Choose files
				</Button>
				<input
					id={inputId}
					ref={fileInputRef}
					type="file"
					accept="video/*"
					multiple
					className="hidden"
					onChange={(e) => {
						addFiles(e.target.files);
						e.target.value = "";
					}}
				/>
			</div>

			{items.length > 0 && (
				<>
					{/* Controls */}
					<div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
						<div className="flex flex-col gap-1.5">
							<span
								id={formatLabelId}
								className="text-xs font-medium text-muted-foreground"
							>
								Convert to
							</span>
							<Select
								value={format}
								onValueChange={(value) => {
									const parsed = parseVideoOutputFormat(value);
									if (Either.isRight(parsed)) changeFormat(parsed.right);
								}}
								disabled={isRunning}
							>
								<SelectTrigger className="w-32" aria-labelledby={formatLabelId}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{VIDEO_OUTPUT_FORMATS.map((f) => (
										<SelectItem key={f.value} value={f.value}>
											{f.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="ml-auto flex gap-2">
							{isRunning ? (
								<Button
									variant="outline"
									onClick={() => setConfirmCancel(true)}
									disabled={cancelling}
									className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
								>
									{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
									{cancelling ? "Cancelling…" : "Cancel"}
								</Button>
							) : (
								<Button variant="ghost" onClick={reset}>
									Clear
								</Button>
							)}
							<Button
								onClick={handleConvert}
								disabled={isRunning || convertable.length === 0}
							>
								{isRunning ? <Loader2 className="animate-spin" /> : null}
								{convertLabel}
							</Button>
						</div>
					</div>

					{/* File list */}
					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<li
								key={item.id}
								className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
							>
								<Film className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{item.file.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatBytes(item.file.size)}
										{item.status === "processing" &&
											typeof item.percent === "number" &&
											` · ${item.percent}%`}
										{item.status === "done" &&
											item.outSize != null &&
											` → ${formatBytes(item.outSize)} (${item.outLabel})`}
										{item.status === "error" && item.message && (
											<span className="text-destructive">
												{" "}
												· {item.message}
											</span>
										)}
									</p>
									{item.status === "processing" && (
										<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
											<div
												className="h-full bg-primary transition-[width] duration-150 ease-out"
												style={{ width: `${item.percent ?? 0}%` }}
											/>
										</div>
									)}
								</div>
								<StatusBadge status={item.status} />
								{item.status === "done" && item.outBlob && (
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleSaveOne(item)}
									>
										<Download />
										Save
									</Button>
								)}
								{!isRunning && (
									<button
										type="button"
										onClick={() => removeItem(item.id)}
										className="text-muted-foreground hover:text-foreground"
										aria-label={`Remove ${item.file.name}`}
									>
										<X className="size-4" />
									</button>
								)}
							</li>
						))}
					</ul>
				</>
			)}

			<ProcessTimeDialog
				pending={pending}
				format={format}
				dontShowAgain={dontShowAgain}
				onDontShowAgainChange={setDontShowAgain}
				onCancel={() => setPending(null)}
				onConfirm={confirmPending}
			/>

			<AlertDialog
				open={confirmCancel}
				onOpenChange={(open) => {
					if (!open) setConfirmCancel(false);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogMedia>
							<Ban />
						</AlertDialogMedia>
						<AlertDialogTitle>Cancel conversion?</AlertDialogTitle>
						<AlertDialogDescription>
							The current file and any remaining files in the queue will not be
							converted. Videos you&apos;ve already downloaded stay available.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep converting</AlertDialogCancel>
						<AlertDialogAction
							onClick={cancelConversion}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							<Ban />
							Cancel conversion
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

interface ProcessTimeDialogProps {
	pending: Item[] | null;
	format: VideoOutputFormat;
	dontShowAgain: boolean;
	onDontShowAgainChange: (value: boolean) => void;
	onCancel: () => void;
	onConfirm: () => void;
}

function ProcessTimeDialog({
	pending,
	format,
	dontShowAgain,
	onDontShowAgainChange,
	onCancel,
	onConfirm,
}: ProcessTimeDialogProps) {
	const checkboxId = useId();
	const largest = pending ? Math.max(...pending.map((t) => t.file.size)) : 0;
	// Files ≥50MB always warn — the checkbox can't suppress them, so hide it.
	const suppressible = largest < 50 * MB;
	const minutes = estimateMinutes(largest, format);
	const formatLabel =
		VIDEO_OUTPUT_FORMATS.find((f) => f.value === format)?.label ??
		format.toUpperCase();

	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>
						<Clock />
					</AlertDialogMedia>
					<AlertDialogTitle>This one will take a few minutes</AlertDialogTitle>
					<AlertDialogDescription>
						This file is ~{Math.round(largest / MB)} MB. Converting to{" "}
						{formatLabel} typically takes{" "}
						{minutes === 1 ? "about a minute" : `~${minutes} minutes`} on this
						hardware. Everything runs on your device — please keep this tab
						open.
					</AlertDialogDescription>
				</AlertDialogHeader>
				{suppressible && (
					<label
						htmlFor={checkboxId}
						className="flex items-center gap-2 text-sm text-muted-foreground"
					>
						<Checkbox
							id={checkboxId}
							checked={dontShowAgain}
							onCheckedChange={(checked) =>
								onDontShowAgainChange(checked === true)
							}
						/>
						Don&apos;t show this again for files under 50 MB
					</label>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						Convert anyway
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function StatusBadge({ status }: { status: ItemStatus }) {
	if (status === "processing")
		return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
	if (status === "done")
		return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
	if (status === "error")
		return <CircleAlert className="size-4 shrink-0 text-destructive" />;
	return null;
}

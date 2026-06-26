import { createFileRoute } from "@tanstack/react-router";
import { Effect, Either } from "effect";
import {
	CheckCircle2,
	CircleAlert,
	Download,
	Film,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	ENGINE_SIZE_LABEL,
	isEngineCached,
	type LoadPhase,
} from "#/lib/video/cache.ts";
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

const MB = 1024 * 1024;

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

function VideoConverterPage() {
	const [phase, setPhase] = useState<LoadPhase>({ kind: "checking" });
	const [declined, setDeclined] = useState(false);

	const startLoad = useCallback(async () => {
		setDeclined(false);
		setPhase({ kind: "downloading", percent: 0 });
		try {
			// Dynamic import is the whole reason this gate exists: it keeps
			// @ffmpeg/* out of the route bundle until the user opts in.
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(
				loadEngine((next) => {
					setPhase(next);
				}),
			);
		} catch (err) {
			setPhase({
				kind: "error",
				message:
					err instanceof Error
						? err.message
						: "Could not load the video engine.",
			});
		}
	}, []);

	// On mount: peek the Cache API. If the engine is already cached, we skip
	// the consent dialog entirely and jump straight into the cheap "preparing"
	// (ffmpeg.load) stage — the issue's "Engine cached, ready instantly" path.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cached = await Effect.runPromise(isEngineCached);
			if (cancelled) return;
			if (cached) {
				void startLoad();
			} else {
				setPhase({ kind: "consent" });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [startLoad]);

	if (phase.kind === "ready") {
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

			<EnginePanel
				phase={phase}
				declined={declined}
				onStart={startLoad}
				onDecline={() => setDeclined(true)}
			/>
		</div>
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
					title="Preparing video tools"
					body="Checking for a cached engine…"
				/>
				<AlertDialog
					open={dialogOpen}
					onOpenChange={(open) => {
						if (!open) onDecline();
					}}
				>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogMedia>
								<Film />
							</AlertDialogMedia>
							<AlertDialogTitle>
								Download the video engine ({ENGINE_SIZE_LABEL})
							</AlertDialogTitle>
							<AlertDialogDescription>
								Video conversion runs entirely on your device, but the engine
								itself is a one-time {ENGINE_SIZE_LABEL} download. It is cached
								after the first load, so return visits are instant. Nothing
								leaves your browser.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Maybe later</AlertDialogCancel>
							<AlertDialogAction onClick={onStart}>
								<Download />
								Yes, download
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		);
	}

	if (phase.kind === "consent" && declined) {
		return (
			<div className="rounded-xl border border-dashed bg-card p-8 text-center">
				<Film className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">Video conversion is disabled</p>
				<p className="mt-1 text-sm text-muted-foreground">
					The {ENGINE_SIZE_LABEL} engine download is required to use this tool.
				</p>
				<Button className="mt-4" onClick={onStart}>
					<Download />
					Enable video conversion
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
						: "Initializing the engine in a worker thread (1–2s)."}
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

function ConverterShell() {
	const inputId = useId();
	const formatLabelId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [items, setItems] = useState<Item[]>([]);
	const [format, setFormat] = useState<VideoOutputFormat>("mp4");
	const [isRunning, setIsRunning] = useState(false);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchDone, setBatchDone] = useState(0);

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: Item[] = [];

		for (const file of Array.from(fileList)) {
			if (!file.type.startsWith("video/")) {
				toast.error(`"${file.name}" is not a video.`);
				continue;
			}
			accepted.push({
				id: `${file.name}-${file.size}-${file.lastModified}-${accepted.length}`,
				file,
				status: "ready",
			});
		}

		if (accepted.length > 0) {
			setItems((prev) => [...prev, ...accepted]);
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

	async function handleConvert() {
		const targets = items.filter(
			(i) => i.status === "ready" || i.status === "error",
		);
		if (targets.length === 0) return;

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
			const { convertVideos } = await import("#/lib/video/converter.ts");

			const outputs = await Effect.runPromise(
				convertVideos(inputs, (update) => {
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
				}),
			);

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
			toast.error(
				err instanceof Error
					? err.message
					: "Video conversion failed unexpectedly.",
			);
		} finally {
			setIsRunning(false);
		}
	}

	function handleSaveOne(item: Item) {
		if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
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
					browser. Files convert one at a time to keep memory in check.
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
							<Button variant="ghost" onClick={reset} disabled={isRunning}>
								Clear
							</Button>
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
		</div>
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

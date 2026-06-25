import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	ArrowRight,
	CheckCircle2,
	CircleAlert,
	Download,
	ImageIcon,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { type ResizeOutput, resizeImage } from "#/lib/image/resizer.ts";
import {
	MAX_DIMENSION,
	MAX_FILE_BYTES,
	outputFileName,
	sourceFormatMeta,
} from "#/lib/image/types.ts";

export const Route = createFileRoute("/resizer")({ component: ResizerPage });

type Mode = "pixels" | "percent";
type Status = "idle" | "processing" | "done" | "error";

interface Source {
	file: File;
	srcW: number;
	srcH: number;
}

const MB = 1024 * 1024;
const PRESETS = [75, 50, 25] as const;

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

const toInt = (v: string) => {
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
};

function ResizerPage() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [source, setSource] = useState<Source | null>(null);
	const [mode, setMode] = useState<Mode>("pixels");

	// By pixels
	const [pxWidth, setPxWidth] = useState("");
	const [pxHeight, setPxHeight] = useState("");
	const [maintainAR, setMaintainAR] = useState(true);
	const [lastEdited, setLastEdited] = useState<"w" | "h">("w");
	const [noEnlarge, setNoEnlarge] = useState(true);

	// By percentage
	const [pct, setPct] = useState(50);

	const [status, setStatus] = useState<Status>("idle");
	const [result, setResult] = useState<ResizeOutput | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	// Predicted output dimensions (in px), computed live.
	let outW = 0;
	let outH = 0;
	if (source) {
		if (mode === "percent") {
			outW = Math.max(1, Math.round((source.srcW * pct) / 100));
			outH = Math.max(1, Math.round((source.srcH * pct) / 100));
		} else {
			outW = toInt(pxWidth);
			outH = toInt(pxHeight);
		}
	}

	const enlarges = source != null && (outW > source.srcW || outH > source.srcH);
	const blockedByEnlarge = mode === "pixels" && noEnlarge && enlarges;
	const canResize =
		source != null &&
		status !== "processing" &&
		outW >= 1 &&
		outH >= 1 &&
		!blockedByEnlarge;

	function clearResult() {
		setResult(null);
		setStatus("idle");
		setErrorMsg(null);
	}

	async function selectFile(fileList: FileList | null) {
		const file = fileList?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(`"${file.name}" is not an image.`);
			return;
		}
		if (file.size > MAX_FILE_BYTES) {
			toast.error(
				`"${file.name}" is ${formatBytes(file.size)}, over the ${Math.round(
					MAX_FILE_BYTES / MB,
				)} MB limit.`,
			);
			return;
		}
		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(file);
		} catch {
			toast.error(`Could not read "${file.name}".`);
			return;
		}
		const srcW = bitmap.width;
		const srcH = bitmap.height;
		bitmap.close();
		if (srcW > MAX_DIMENSION || srcH > MAX_DIMENSION) {
			toast.error(
				`"${file.name}" is ${srcW}×${srcH}px, over the ${MAX_DIMENSION.toLocaleString()}px limit.`,
			);
			return;
		}
		setSource({ file, srcW, srcH });
		setPxWidth(String(srcW));
		setPxHeight(String(srcH));
		setLastEdited("w");
		setPct(50);
		clearResult();
	}

	function reset() {
		setSource(null);
		clearResult();
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function changeWidth(value: string) {
		setPxWidth(value);
		setLastEdited("w");
		if (maintainAR && source) {
			const w = toInt(value);
			if (w > 0) {
				setPxHeight(
					String(Math.max(1, Math.round((w * source.srcH) / source.srcW))),
				);
			}
		}
		clearResult();
	}

	function changeHeight(value: string) {
		setPxHeight(value);
		setLastEdited("h");
		if (maintainAR && source) {
			const h = toInt(value);
			if (h > 0) {
				setPxWidth(
					String(Math.max(1, Math.round((h * source.srcW) / source.srcH))),
				);
			}
		}
		clearResult();
	}

	function toggleMaintainAR(on: boolean) {
		setMaintainAR(on);
		// Re-derive the locked dimension from the current driver.
		if (on && source) {
			if (lastEdited === "w") {
				const w = toInt(pxWidth);
				if (w > 0)
					setPxHeight(
						String(Math.max(1, Math.round((w * source.srcH) / source.srcW))),
					);
			} else {
				const h = toInt(pxHeight);
				if (h > 0)
					setPxWidth(
						String(Math.max(1, Math.round((h * source.srcW) / source.srcH))),
					);
			}
		}
		clearResult();
	}

	function changePct(value: number) {
		// Capped at 100% — the resizer never upscales.
		setPct(Math.min(100, Math.max(1, Math.round(value))));
		clearResult();
	}

	async function handleResize() {
		if (!source || !canResize) return;
		setStatus("processing");
		setErrorMsg(null);

		const exit = await Effect.runPromiseExit(
			resizeImage({
				id: crypto.randomUUID(),
				file: source.file,
				targetWidth: outW,
				targetHeight: outH,
			}),
		);

		if (exit._tag === "Success") {
			setResult(exit.value);
			setStatus("done");
			toast.success(`Resized to ${exit.value.width}×${exit.value.height}px.`);
			return;
		}

		// Surface the typed pipeline error message.
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		const message =
			failure && "message" in failure
				? failure.message
				: "Could not resize this image.";
		setErrorMsg(message);
		setStatus("error");
		toast.error(message);
	}

	const sourceFormatLabel = source
		? sourceFormatMeta(source.file.type).label
		: "";

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Image Resizer</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Resize an image by pixels or percentage — entirely in your browser.
					Keeps the source format. Up to {Math.round(MAX_FILE_BYTES / MB)} MB
					and {MAX_DIMENSION.toLocaleString()}px max.
				</p>
			</div>

			{!source ? (
				// Dropzone
				// biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input.
				<div
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						selectFile(e.dataTransfer.files);
					}}
					className="rounded-xl border border-dashed bg-card p-8 text-center"
				>
					<UploadCloud className="mx-auto size-8 text-muted-foreground" />
					<p className="mt-3 text-sm font-medium">
						Drag &amp; drop an image here, or
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={() => fileInputRef.current?.click()}
					>
						Choose a file
					</Button>
					<input
						id={inputId}
						ref={fileInputRef}
						type="file"
						accept="image/*"
						className="hidden"
						onChange={(e) => {
							selectFile(e.target.files);
							e.target.value = "";
						}}
					/>
				</div>
			) : (
				<>
					{/* Source → predicted dimensions */}
					<div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
						<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium">{source.file.name}</p>
							<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
								<span>
									{source.srcW} × {source.srcH}px
								</span>
								<ArrowRight className="size-3.5" />
								<span className="font-medium text-foreground">
									{outW || "?"} × {outH || "?"}px
								</span>
								<span>· {sourceFormatLabel}</span>
							</div>
						</div>
						<button
							type="button"
							onClick={reset}
							className="text-muted-foreground hover:text-foreground"
							aria-label="Remove image"
						>
							<X className="size-4" />
						</button>
					</div>

					{/* Mode toggle */}
					<div className="mt-6 inline-flex gap-1 rounded-lg border bg-card p-1">
						<Button
							variant={mode === "pixels" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => {
								setMode("pixels");
								clearResult();
							}}
						>
							By pixels
						</Button>
						<Button
							variant={mode === "percent" ? "secondary" : "ghost"}
							size="sm"
							onClick={() => {
								setMode("percent");
								clearResult();
							}}
						>
							By percentage
						</Button>
					</div>

					{/* Controls */}
					<div className="mt-4 rounded-xl border bg-card p-4">
						{mode === "pixels" ? (
							<div className="flex flex-col gap-4">
								<div className="flex flex-wrap items-end gap-4">
									<div className="flex flex-col gap-1.5">
										<span className="text-xs font-medium text-muted-foreground">
											Width (px)
										</span>
										<Input
											type="number"
											min={1}
											className="w-28"
											value={pxWidth}
											onChange={(e) => changeWidth(e.target.value)}
										/>
									</div>
									<span className="pb-2 text-muted-foreground">×</span>
									<div className="flex flex-col gap-1.5">
										<span className="text-xs font-medium text-muted-foreground">
											Height (px)
										</span>
										<Input
											type="number"
											min={1}
											className="w-28"
											value={pxHeight}
											onChange={(e) => changeHeight(e.target.value)}
										/>
									</div>
								</div>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										className="size-4 accent-primary"
										checked={maintainAR}
										onChange={(e) => toggleMaintainAR(e.target.checked)}
									/>
									Maintain aspect ratio
								</label>
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										className="size-4 accent-primary"
										checked={noEnlarge}
										onChange={(e) => {
											setNoEnlarge(e.target.checked);
											clearResult();
										}}
									/>
									Do not enlarge (no upscaling)
								</label>
							</div>
						) : (
							<div className="flex flex-col gap-4">
								<div className="flex flex-wrap items-center gap-2">
									{PRESETS.map((p) => (
										<Button
											key={p}
											variant={pct === p ? "secondary" : "outline"}
											size="sm"
											onClick={() => changePct(p)}
										>
											{p}%
										</Button>
									))}
									<div className="ml-2 flex items-center gap-2">
										<span className="text-xs font-medium text-muted-foreground">
											Custom
										</span>
										<Input
											type="number"
											min={1}
											max={100}
											className="w-20"
											value={pct}
											onChange={(e) => changePct(Number(e.target.value))}
										/>
										<span className="text-sm text-muted-foreground">%</span>
									</div>
								</div>
								<p className="text-xs text-muted-foreground">
									Scales to a fraction of the original. Capped at 100% — the
									resizer never upscales.
								</p>
							</div>
						)}

						{blockedByEnlarge && (
							<p className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
								<CircleAlert className="size-4 shrink-0" />
								Target {outW}×{outH}px is larger than the source — uncheck “Do
								not enlarge” or choose a smaller size.
							</p>
						)}

						<div className="mt-4 flex items-center justify-end gap-2">
							<Button
								variant="ghost"
								onClick={reset}
								disabled={status === "processing"}
							>
								Clear
							</Button>
							<Button onClick={handleResize} disabled={!canResize}>
								{status === "processing" ? (
									<Loader2 className="animate-spin" />
								) : null}
								Resize
							</Button>
						</div>
					</div>

					{/* Result */}
					{status === "done" && result && (
						<div className="mt-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
							<CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
							<p className="min-w-0 flex-1 text-sm">
								Resized to{" "}
								<span className="font-medium">
									{result.width} × {result.height}px
								</span>{" "}
								<span className="text-muted-foreground">
									({formatBytes(result.size)}, {sourceFormatLabel})
								</span>
							</p>
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									const meta = sourceFormatMeta(source.file.type);
									downloadBlob(
										result.blob,
										outputFileName(source.file.name, meta.ext),
									);
								}}
							>
								<Download />
								Save
							</Button>
						</div>
					)}

					{status === "error" && errorMsg && (
						<p className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
							<CircleAlert className="size-4 shrink-0" />
							{errorMsg}
						</p>
					)}
				</>
			)}
		</div>
	);
}

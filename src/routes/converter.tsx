import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	CheckCircle2,
	CircleAlert,
	Download,
	FileArchive,
	ImageIcon,
	Loader2,
	UploadCloud,
	X,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { convertImages, type ProgressUpdate } from "#/lib/image/converter.ts";
import {
	formatMeta,
	MAX_DIMENSION,
	MAX_FILE_BYTES,
	MAX_FILES,
	OUTPUT_FORMATS,
	type OutputFormat,
	outputFileName,
} from "#/lib/image/types.ts";
import { createZip } from "#/lib/image/zip.ts";

export const Route = createFileRoute("/converter")({
	component: ConverterPage,
});

type ItemStatus = "ready" | "processing" | "done" | "error";

interface Item {
	id: string;
	file: File;
	status: ItemStatus;
	outBlob?: Blob;
	outName?: string;
	outLabel?: string;
	outSize?: number;
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

// Make zip entry names unique (two "photo.jpg" inputs → photo.jpg, photo-1.jpg).
function uniqueNames(names: string[]) {
	const seen = new Map<string, number>();
	return names.map((name) => {
		const count = seen.get(name) ?? 0;
		seen.set(name, count + 1);
		if (count === 0) return name;
		const dot = name.lastIndexOf(".");
		return dot === -1
			? `${name}-${count}`
			: `${name.slice(0, dot)}-${count}${name.slice(dot)}`;
	});
}

function ConverterPage() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [items, setItems] = useState<Item[]>([]);
	const [format, setFormat] = useState<OutputFormat>("webp");
	const [isRunning, setIsRunning] = useState(false);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchDone, setBatchDone] = useState(0);

	const meta = formatMeta(format);
	const convertable = items.filter(
		(i) => i.status === "ready" || i.status === "error",
	);
	const doneItems = items.filter((i) => i.status === "done" && i.outBlob);

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: Item[] = [];

		for (const file of Array.from(fileList)) {
			if (!file.type.startsWith("image/")) {
				toast.error(`"${file.name}" is not an image.`);
				continue;
			}
			if (file.size > MAX_FILE_BYTES) {
				toast.error(
					`"${file.name}" is ${formatBytes(file.size)}, over the ${Math.round(
						MAX_FILE_BYTES / MB,
					)} MB limit.`,
				);
				continue;
			}
			accepted.push({ id: crypto.randomUUID(), file, status: "ready" });
		}

		setItems((prev) => {
			const room = MAX_FILES - prev.length;
			if (accepted.length > room) {
				toast.error(`You can convert up to ${MAX_FILES} images at a time.`);
			}
			return [...prev, ...accepted.slice(0, Math.max(room, 0))];
		});
	}

	function removeItem(id: string) {
		setItems((prev) => prev.filter((i) => i.id !== id));
	}

	function reset() {
		setItems([]);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	function changeFormat(value: OutputFormat) {
		setFormat(value);
		// Converted/failed items become re-convertable in the new target format.
		setItems((prev) =>
			prev.map((item) =>
				item.status === "done" || item.status === "error"
					? {
							...item,
							status: "ready",
							outBlob: undefined,
							outName: undefined,
							outLabel: undefined,
							outSize: undefined,
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

		const ext = meta.ext;
		const label = meta.label;
		const inputs = targets.map((item) => ({
			id: item.id,
			file: item.file,
			format,
		}));

		const onProgress = (update: ProgressUpdate) => {
			setItems((prev) =>
				prev.map((item) =>
					item.id === update.id
						? {
								...item,
								status: update.status,
								outBlob: update.output?.blob ?? item.outBlob,
								outSize: update.output?.size ?? item.outSize,
								outName: update.output
									? outputFileName(item.file.name, ext)
									: item.outName,
								outLabel: update.output ? label : item.outLabel,
								message: update.error?.message,
							}
						: item,
				),
			);
			if (update.status === "done" || update.status === "error") {
				setBatchDone((n) => n + 1);
			}
		};

		const outputs = await Effect.runPromise(convertImages(inputs, onProgress));
		setIsRunning(false);

		const ok = outputs.length;
		if (ok > 0) {
			toast.success(
				`Convert ${ok} image${ok === 1 ? "" : "s"} to ${label} success`,
			);
		}
		const failed = inputs.length - ok;
		if (failed > 0) {
			toast.error(
				`${failed} image${failed === 1 ? "" : "s"} could not be converted.`,
			);
		}
	}

	function handleSaveOne(item: Item) {
		if (item.outBlob && item.outName) downloadBlob(item.outBlob, item.outName);
	}

	async function handleDownloadZip() {
		if (doneItems.length === 0) return;
		const names = uniqueNames(doneItems.map((d) => d.outName ?? "image"));

		const program = Effect.gen(function* () {
			const entries: Record<string, Uint8Array> = {};
			for (let i = 0; i < doneItems.length; i++) {
				const blob = doneItems[i].outBlob;
				if (!blob) continue;
				const buffer = yield* Effect.promise(() => blob.arrayBuffer());
				entries[names[i]] = new Uint8Array(buffer);
			}
			return yield* createZip(entries);
		});

		const exit = await Effect.runPromiseExit(program);
		if (exit._tag !== "Success") {
			toast.error("Could not build the zip file.");
			return;
		}
		downloadBlob(exit.value, "palico-converted.zip");
		toast.success("Downloaded all images as a zip.");
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Image Converter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert images to JPG, PNG, or WebP — entirely in your browser. Up to{" "}
					{MAX_FILES} files, {Math.round(MAX_FILE_BYTES / MB)} MB and{" "}
					{MAX_DIMENSION.toLocaleString()}px max each.
				</p>
			</div>

			{/* Dropzone */}
			{/** biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input. */}
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
					Drag &amp; drop images here, or
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
					accept="image/*"
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
							<span className="text-xs font-medium text-muted-foreground">
								Convert to
							</span>
							<Select
								value={format}
								onValueChange={(value) => changeFormat(value as OutputFormat)}
								disabled={isRunning}
							>
								<SelectTrigger className="w-32">
									<SelectValue>{() => meta.label}</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{OUTPUT_FORMATS.map((f) => (
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
							{doneItems.length > 1 && (
								<Button
									variant="outline"
									onClick={handleDownloadZip}
									disabled={isRunning}
								>
									<FileArchive />
									Download all (.zip)
								</Button>
							)}
							{convertable.length > 0 && (
								<Button onClick={handleConvert} disabled={isRunning}>
									{isRunning ? <Loader2 className="animate-spin" /> : null}
									{isRunning
										? `Converting ${batchDone} / ${batchTotal}`
										: `Convert ${convertable.length}`}
								</Button>
							)}
						</div>
					</div>

					{/* File list */}
					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<li
								key={item.id}
								className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
							>
								<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{item.file.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{formatBytes(item.file.size)}
										{item.status === "done" &&
											item.outSize != null &&
											` → ${formatBytes(item.outSize)} (${item.outLabel})`}
										{item.status === "error" && item.message && (
											<span className="text-destructive">
												{" "}
												— {item.message}
											</span>
										)}
									</p>
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

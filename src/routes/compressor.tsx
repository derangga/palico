import { createFileRoute, Link } from "@tanstack/react-router";
import { Effect } from "effect";
import { FileArchive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ComparePanel } from "#/components/compressor/compare-panel.tsx";
import { FileRow } from "#/components/converter/file-row.tsx";
import type { Item } from "#/components/converter/types.ts";
import {
	downloadBlob,
	formatBytes,
	uniqueNames,
} from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	type CompressFormat,
	type CompressProgress,
	compressImages,
} from "#/lib/image/compressor.ts";
import { MAX_DIMENSION, MAX_FILE_BYTES, MAX_FILES } from "#/lib/image/types.ts";
import { createZip } from "#/lib/image/zip.ts";

export const Route = createFileRoute("/compressor")({
	component: CompressorPage,
});

const MB = 1024 * 1024;

const PRESETS = [
	{ label: "Small", value: 50 },
	{ label: "Balanced", value: 75 },
	{ label: "Best", value: 90 },
] as const;

const FORMATS: ReadonlyArray<{ value: CompressFormat; label: string }> = [
	{ value: "same", label: "Same as original" },
	{ value: "jpeg", label: "JPG" },
	{ value: "webp", label: "WebP" },
];

function CompressorPage() {
	const [items, setItems] = useState<Item[]>([]);
	const [quality, setQuality] = useState(75);
	const [format, setFormat] = useState<CompressFormat>("same");
	const [limitOn, setLimitOn] = useState(false);
	const [limitKb, setLimitKb] = useState("200");
	const [isRunning, setIsRunning] = useState(false);
	const [batchTotal, setBatchTotal] = useState(0);
	const [batchDone, setBatchDone] = useState(0);
	const [compareId, setCompareId] = useState<string | null>(null);

	const kb = Number(limitKb);
	const limitValid = !limitOn || (Number.isFinite(kb) && kb >= 1);
	const targetBytes = limitOn && limitValid ? Math.round(kb * 1024) : undefined;

	const compressable = items.filter(
		(i) => i.status === "ready" || i.status === "error",
	);
	const doneItems = items.filter((i) => i.status === "done" && i.outBlob);
	const savedBytes = doneItems.reduce(
		(sum, i) => sum + Math.max(i.file.size - (i.outSize ?? i.file.size), 0),
		0,
	);
	const missedTarget = doneItems.some((i) => i.note?.startsWith("Couldn't"));
	const compareItem = items.find(
		(i) => i.id === compareId && i.status === "done" && i.outBlob,
	);

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

		const room = Math.max(MAX_FILES - items.length, 0);
		if (accepted.length > room) {
			toast.error(`You can compress up to ${MAX_FILES} images at a time.`);
		}
		setItems((prev) => [
			...prev,
			...accepted.slice(0, Math.max(MAX_FILES - prev.length, 0)),
		]);
	}

	// A settings change makes finished rows stale: send them back to ready.
	function resetResults() {
		setCompareId(null);
		setItems((prev) =>
			prev.map((item) =>
				item.status === "done" || item.status === "error"
					? { id: item.id, file: item.file, status: "ready" }
					: item,
			),
		);
	}

	function changeQuality(value: number) {
		setQuality(value);
		resetResults();
	}

	async function handleCompress() {
		if (compressable.length === 0 || !limitValid) return;
		setIsRunning(true);
		setCompareId(null);
		setBatchTotal(compressable.length);
		setBatchDone(0);

		const inputs = compressable.map((item) => ({
			id: item.id,
			file: item.file,
			format,
			quality: quality / 100,
			targetBytes,
		}));

		const onProgress = (update: CompressProgress) => {
			setItems((prev) =>
				prev.map((item) => {
					if (item.id !== update.id) return item;
					if (update.status === "done") {
						const out = update.output;
						return {
							...item,
							status: "done",
							outBlob: out.blob,
							outSize: out.size,
							outName: out.fileName,
							outLabel: out.formatLabel,
							savedPct: Math.round((1 - out.size / out.originalSize) * 100),
							note: out.keptOriginal
								? "Already small, kept the original."
								: !out.targetMet && targetBytes != null
									? `Couldn't get under ${formatBytes(targetBytes)}. This is the smallest at this size.`
									: undefined,
							message: undefined,
						};
					}
					if (update.status === "error") {
						return {
							...item,
							status: "error",
							message: update.error.message,
						};
					}
					return { ...item, status: "processing" };
				}),
			);
			if (update.status === "done" || update.status === "error") {
				setBatchDone((n) => n + 1);
			}
		};

		const outputs = await Effect.runPromise(compressImages(inputs, onProgress));
		setIsRunning(false);

		const ok = outputs.length;
		if (ok > 0) {
			toast.success(`Compressed ${ok} image${ok === 1 ? "" : "s"}.`);
		}
		const failed = inputs.length - ok;
		if (failed > 0) {
			toast.error(
				`${failed} image${failed === 1 ? "" : "s"} could not be compressed.`,
			);
		}
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
		downloadBlob(exit.value, "palico-compressed.zip");
		toast.success("Downloaded all images as a zip.");
	}

	return (
		<PageShell>
			<PageHeader title="Compress Image">
				Make JPG, PNG and WebP files smaller without changing their size in
				pixels, entirely in your browser. Up to {MAX_FILES} files,{" "}
				{Math.round(MAX_FILE_BYTES / MB)} MB and{" "}
				{MAX_DIMENSION.toLocaleString()}px max each.
			</PageHeader>

			<Dropzone
				label="Drag & drop images here, or"
				actionLabel="Choose files"
				hint={`Images up to ${Math.round(MAX_FILE_BYTES / MB)} MB each, ${MAX_FILES} files at a time`}
				accept="image/*"
				multiple
				ariaLabel="Choose images to compress"
				onFiles={addFiles}
			/>

			{items.length > 0 && (
				<>
					{/* Controls */}
					<div className="mt-6 flex flex-col gap-4 rounded-xl border bg-card p-4">
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<label
									htmlFor="compress-quality"
									className="text-xs font-medium text-muted-foreground"
								>
									Quality
								</label>
								<span className="font-mono text-sm">{quality}%</span>
							</div>
							<input
								id="compress-quality"
								type="range"
								min={10}
								max={95}
								step={5}
								value={quality}
								disabled={isRunning}
								onChange={(e) => changeQuality(Number(e.target.value))}
								className="w-full accent-primary"
							/>
							<div className="flex flex-wrap gap-2">
								{PRESETS.map((p) => (
									<Button
										key={p.value}
										variant={quality === p.value ? "secondary" : "outline"}
										size="sm"
										disabled={isRunning}
										onClick={() => changeQuality(p.value)}
									>
										{p.label}
									</Button>
								))}
							</div>
						</div>

						<div className="flex flex-wrap items-end gap-4">
							<div className="flex flex-col gap-1.5">
								<span className="text-xs font-medium text-muted-foreground">
									Save as
								</span>
								<Select
									value={format}
									onValueChange={(value) => {
										setFormat(value as CompressFormat);
										resetResults();
									}}
									disabled={isRunning}
								>
									<SelectTrigger className="w-44">
										<SelectValue>
											{() => FORMATS.find((f) => f.value === format)?.label}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{FORMATS.map((f) => (
											<SelectItem key={f.value} value={f.value}>
												{f.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2 pb-2">
								<Checkbox
									id="compress-limit"
									checked={limitOn}
									disabled={isRunning}
									onCheckedChange={(on) => {
										setLimitOn(on);
										resetResults();
									}}
								/>
								<label htmlFor="compress-limit" className="text-sm">
									Keep each file under
								</label>
								<Input
									type="number"
									min={1}
									className="w-24"
									value={limitKb}
									disabled={!limitOn || isRunning}
									aria-label="Maximum file size in KB"
									aria-invalid={!limitValid}
									onChange={(e) => {
										setLimitKb(e.target.value);
										resetResults();
									}}
								/>
								<span className="text-sm text-muted-foreground">KB</span>
							</div>
						</div>

						<p className="text-xs text-muted-foreground">
							PNGs are saved as WebP, which is much smaller.
						</p>

						<div className="flex flex-wrap justify-end gap-2">
							<Button
								variant="ghost"
								onClick={() => {
									setItems([]);
									setCompareId(null);
								}}
								disabled={isRunning}
							>
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
							{compressable.length > 0 && (
								<Button
									onClick={handleCompress}
									disabled={isRunning || !limitValid}
								>
									{isRunning ? <Loader2 className="animate-spin" /> : null}
									{isRunning
										? `Compressing ${batchDone} / ${batchTotal}`
										: `Compress ${compressable.length}`}
								</Button>
							)}
						</div>
					</div>

					{!isRunning && doneItems.length > 0 && (
						<p className="mt-4 text-sm">
							{savedBytes > 0
								? `Saved ${formatBytes(savedBytes)} across ${doneItems.length} image${doneItems.length === 1 ? "" : "s"}.`
								: "These images were already small."}
							{missedTarget && (
								<>
									{" "}
									Some files are still over the limit. Making them smaller in
									pixels helps:{" "}
									<Link
										to="/resizer"
										className="font-semibold text-primary underline"
									>
										Image Resizer
									</Link>
									.
								</>
							)}
						</p>
					)}

					{/* File list */}
					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<FileRow
								key={item.id}
								item={item}
								isRunning={isRunning}
								onRemove={() => {
									if (compareId === item.id) setCompareId(null);
									setItems((prev) => prev.filter((i) => i.id !== item.id));
								}}
								onCompare={
									item.status === "done" && (item.savedPct ?? 0) > 0
										? () => setCompareId(item.id)
										: undefined
								}
							/>
						))}
					</ul>

					{compareItem?.outBlob && (
						<ComparePanel
							key={compareItem.id}
							name={compareItem.file.name}
							before={compareItem.file}
							after={compareItem.outBlob}
							onClose={() => setCompareId(null)}
						/>
					)}
				</>
			)}
		</PageShell>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Effect, Exit, Schema } from "effect";
import { FileArchive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
	OutputFormat,
	outputFileName,
} from "#/lib/image/types.ts";
import { createZip } from "#/lib/image/zip.ts";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/converter")({
	head: () => seoHead("/converter"),
	component: ConverterPage,
});

const MB = 1024 * 1024;

function ConverterPage() {
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

		const room = Math.max(MAX_FILES - items.length, 0);

		if (accepted.length > room) {
			toast.error(`You can convert up to ${MAX_FILES} images at a time.`);
		}

		setItems((prev) => [
			...prev,
			...accepted.slice(0, Math.max(MAX_FILES - prev.length, 0)),
		]);
	}

	function removeItem(id: string) {
		setItems((prev) => prev.filter((i) => i.id !== id));
	}

	function reset() {
		setItems([]);
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
				prev.map((item) => {
					if (item.id !== update.id) return item;

					if (update.status === "done") {
						return {
							...item,
							status: update.status,
							outBlob: update.output.blob,
							outSize: update.output.size,
							outName: outputFileName(item.file.name, ext),
							outLabel: label,
							message: undefined,
						};
					}

					if (update.status === "error") {
						return {
							...item,
							status: update.status,
							message: update.error.message,
						};
					}

					return { ...item, status: update.status };
				}),
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

		if (Exit.isFailure(exit)) {
			toast.error("Could not build the zip file.");

			return;
		}

		downloadBlob(exit.value, "palico-converted.zip");
		toast.success("Downloaded all images as a zip.");
	}

	return (
		<PageShell>
			<PageHeader title="Image Converter">
				Convert images to JPG, PNG, or WebP, entirely in your browser. Up to{" "}
				{MAX_FILES} files, {Math.round(MAX_FILE_BYTES / MB)} MB and{" "}
				{MAX_DIMENSION.toLocaleString()}px max each.
			</PageHeader>

			<Dropzone
				label="Drag & drop images here, or"
				actionLabel="Choose files"
				hint={`Images up to ${Math.round(MAX_FILE_BYTES / MB)} MB each, ${MAX_FILES} files at a time`}
				accept="image/*"
				multiple
				ariaLabel="Choose images to convert"
				onFiles={addFiles}
			/>

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
								onValueChange={(value) => {
									if (Schema.is(OutputFormat)(value)) changeFormat(value);
								}}
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
							<FileRow
								key={item.id}
								item={item}
								isRunning={isRunning}
								onRemove={() => removeItem(item.id)}
							/>
						))}
					</ul>
				</>
			)}
		</PageShell>
	);
}

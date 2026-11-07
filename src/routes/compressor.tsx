import { createFileRoute, Link } from "@tanstack/react-router";
import { Effect, Exit, Schema } from "effect";
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
import { currentLocale } from "#/lib/i18n/state.ts";
import {
	CompressFormat,
	type CompressProgress,
	compressImages,
} from "#/lib/image/compressor.ts";
import { MAX_DIMENSION, MAX_FILE_BYTES, MAX_FILES } from "#/lib/image/types.ts";
import { createZip } from "#/lib/image/zip.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/compressor")({
	head: () => seoHead("/compressor"),
	component: CompressorPage,
});

const MB = 1024 * 1024;

// Functions, not constants: a label read at module load would stay in the
// language active then.
const presets = () =>
	[
		{ label: m.compressor_preset_small(), value: 50 },
		{ label: m.compressor_preset_balanced(), value: 75 },
		{ label: m.compressor_preset_best(), value: 90 },
	] as const;

const formats = (): ReadonlyArray<{ value: CompressFormat; label: string }> => [
	{ value: "same", label: m.compressor_format_same() },
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

	const missedTarget = doneItems.some((i) => i.targetMissed);

	const compareItem = items.find(
		(i) => i.id === compareId && i.status === "done" && i.outBlob,
	);

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: Item[] = [];

		for (const file of Array.from(fileList)) {
			if (!file.type.startsWith("image/")) {
				toast.error(m.common_not_an_image({ name: file.name }));
				continue;
			}

			if (file.size > MAX_FILE_BYTES) {
				toast.error(
					m.common_file_over_limit({
						name: file.name,
						size: formatBytes(file.size),
						limit: Math.round(MAX_FILE_BYTES / MB),
					}),
				);
				continue;
			}

			accepted.push({ id: crypto.randomUUID(), file, status: "ready" });
		}

		const room = Math.max(MAX_FILES - items.length, 0);

		if (accepted.length > room) {
			toast.error(m.compressor_too_many({ max: MAX_FILES }));
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
								? m.compressor_note_kept()
								: !out.targetMet && targetBytes != null
									? m.compressor_note_missed({ size: formatBytes(targetBytes) })
									: undefined,
							targetMissed:
								!out.keptOriginal && !out.targetMet && targetBytes != null,
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
			recordToolUse("/compressor");
			toast.success(
				ok === 1
					? m.compressor_success_one({ count: ok })
					: m.compressor_success_other({ count: ok }),
			);
		}

		const failed = inputs.length - ok;

		if (failed > 0) {
			toast.error(
				failed === 1
					? m.compressor_failed_one({ count: failed })
					: m.compressor_failed_other({ count: failed }),
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
			toast.error(m.common_zip_failed());

			return;
		}

		downloadBlob(exit.value, "palico-compressed.zip");
		toast.success(m.common_images_zip_done());
	}

	return (
		<PageShell>
			<PageHeader title={m.tool_compressor_label()}>
				{m.compressor_description({
					files: MAX_FILES,
					mb: Math.round(MAX_FILE_BYTES / MB),
					pixels: MAX_DIMENSION.toLocaleString(currentLocale()),
				})}
			</PageHeader>

			<Dropzone
				label={m.converter_dropzone_label()}
				actionLabel={m.common_choose_files()}
				hint={m.converter_hint({
					mb: Math.round(MAX_FILE_BYTES / MB),
					max: MAX_FILES,
				})}
				accept="image/*"
				multiple
				ariaLabel={m.compressor_dropzone_aria()}
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
									{m.compressor_quality()}
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
								{presets().map((p) => (
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
									{m.compressor_save_as()}
								</span>
								<Select
									value={format}
									onValueChange={(value) => {
										if (!Schema.is(CompressFormat)(value)) return;
										setFormat(value);
										resetResults();
									}}
									disabled={isRunning}
								>
									<SelectTrigger className="w-44">
										<SelectValue>
											{() => formats().find((f) => f.value === format)?.label}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{formats().map((f) => (
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
									{m.compressor_limit_label()}
								</label>
								<Input
									type="number"
									min={1}
									className="w-24"
									value={limitKb}
									disabled={!limitOn || isRunning}
									aria-label={m.compressor_limit_aria()}
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
							{m.compressor_png_note()}
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
								{m.common_clear()}
							</Button>
							{doneItems.length > 1 && (
								<Button
									variant="outline"
									onClick={handleDownloadZip}
									disabled={isRunning}
								>
									<FileArchive />
									{m.common_download_all_zip()}
								</Button>
							)}
							{compressable.length > 0 && (
								<Button
									onClick={handleCompress}
									disabled={isRunning || !limitValid}
								>
									{isRunning ? <Loader2 className="animate-spin" /> : null}
									{isRunning
										? m.compressor_compressing({
												done: batchDone,
												total: batchTotal,
											})
										: m.compressor_compress_count({
												count: compressable.length,
											})}
								</Button>
							)}
						</div>
					</div>

					{!isRunning && doneItems.length > 0 && (
						<p className="mt-4 text-sm">
							{savedBytes > 0
								? doneItems.length === 1
									? m.compressor_saved_one({
											size: formatBytes(savedBytes),
											count: doneItems.length,
										})
									: m.compressor_saved_other({
											size: formatBytes(savedBytes),
											count: doneItems.length,
										})
								: m.compressor_already_small()}
							{missedTarget && (
								<>
									{" "}
									{m.compressor_over_limit()}{" "}
									<Link
										to="/resizer"
										className="font-semibold text-primary underline"
									>
										{m.tool_resizer_label()}
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

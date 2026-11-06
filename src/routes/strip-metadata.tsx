import { createFileRoute } from "@tanstack/react-router";
import { Effect, Result, Exit } from "effect";
import { FileArchive, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { downloadBlob, uniqueNames } from "#/components/converter/utils.ts";
import { Dropzone } from "#/components/dropzone.tsx";
import {
	type MetadataItem,
	MetadataRow,
} from "#/components/metadata/metadata-row.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { MAX_PDF_BYTES } from "#/lib/file/pdf-types.ts";
import { filesLabel } from "#/lib/i18n/counts.ts";
import { MAX_FILE_BYTES, MAX_FILES } from "#/lib/image/types.ts";
import { createZip } from "#/lib/image/zip.ts";
import {
	type FileInput,
	forEachFile,
	inspectFile,
	stripFile,
} from "#/lib/metadata/metadata.ts";
import { ACCEPTED_MIME_TYPES } from "#/lib/metadata/types.ts";
import { seoHead } from "#/lib/seo.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/strip-metadata")({
	head: () => seoHead("/strip-metadata"),
	component: StripMetadataPage,
});

const MB = 1024 * 1024;

const canStrip = (item: MetadataItem) =>
	(item.status === "found" || item.status === "error") &&
	(item.before?.fields.length ?? 0) > 0;

function StripMetadataPage() {
	const [items, setItems] = useState<MetadataItem[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	const strippable = items.filter(canStrip);
	const cleanItems = items.filter((i) => i.status === "clean" && i.blob);

	const update = (id: string, patch: Partial<MetadataItem>) =>
		setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const room = Math.max(MAX_FILES - items.length, 0);
		const files = Array.from(fileList);

		if (files.length > room) {
			toast.error(m.metadata_too_many({ max: MAX_FILES }));
		}

		const added: MetadataItem[] = files.slice(0, room).map((file) => ({
			id: crypto.randomUUID(),
			file,
			status: "reading",
		}));

		if (added.length === 0) return;
		setItems((prev) => [...prev, ...added]);

		Effect.runPromise(
			forEachFile(added, inspectFile, (id, result) =>
				Result.isSuccess(result)
					? update(id, {
							status: result.success.fields.length > 0 ? "found" : "nothing",
							before: result.success,
						})
					: update(id, { status: "error", message: result.failure.message }),
			),
		);
	}

	async function handleStrip() {
		const targets: FileInput[] = strippable.map(({ id, file }) => ({
			id,
			file,
		}));

		if (targets.length === 0) return;
		setIsRunning(true);

		for (const t of targets)
			update(t.id, { status: "stripping", message: undefined });

		const cleaned = new Set<string>();
		await Effect.runPromise(
			forEachFile(targets, stripFile, (id, result) => {
				if (Result.isSuccess(result)) {
					cleaned.add(id);
					update(id, {
						status: "clean",
						blob: result.success.blob,
						after: result.success.after,
					});
				} else {
					update(id, { status: "error", message: result.failure.message });
				}
			}),
		);
		setIsRunning(false);
		const ok = cleaned.size;

		if (ok > 0) {
			toast.success(
				ok === 1
					? m.metadata_success_one({ count: ok })
					: m.metadata_success_other({ count: ok }),
			);
		}

		const failed = targets.length - ok;

		if (failed > 0) {
			toast.error(
				failed === 1
					? m.metadata_failed_one({ count: failed })
					: m.metadata_failed_other({ count: failed }),
			);
		}
	}

	async function handleDownloadZip() {
		const names = uniqueNames(cleanItems.map((i) => i.file.name));

		const program = Effect.gen(function* () {
			const entries: Record<string, Uint8Array> = {};

			for (const [i, item] of cleanItems.entries()) {
				const blob = item.blob;

				if (!blob) continue;
				entries[names[i]] = new Uint8Array(
					yield* Effect.promise(() => blob.arrayBuffer()),
				);
			}

			return yield* createZip(entries);
		});

		const exit = await Effect.runPromiseExit(program);

		if (Exit.isFailure(exit)) {
			toast.error(m.common_zip_failed());

			return;
		}

		downloadBlob(exit.value, "palico-cleaned.zip");
	}

	return (
		<PageShell>
			<PageHeader title={m.tool_strip_metadata_label()}>
				{m.metadata_description()}
			</PageHeader>

			<Dropzone
				label={m.metadata_dropzone_label()}
				actionLabel={m.common_choose_files()}
				hint={m.metadata_hint({
					imageMb: MAX_FILE_BYTES / MB,
					pdfMb: MAX_PDF_BYTES / MB,
					max: MAX_FILES,
				})}
				accept={ACCEPTED_MIME_TYPES.join(",")}
				multiple
				ariaLabel={m.metadata_dropzone_aria()}
				onFiles={addFiles}
			/>

			{items.length > 0 && (
				<>
					<div className="mt-6 flex flex-wrap items-center gap-2">
						<p className="mr-auto text-sm text-muted-foreground">
							{filesLabel(items.length)}
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setItems([])}
							disabled={isRunning}
						>
							{m.metadata_clear_all()}
						</Button>
						{cleanItems.length > 1 && (
							<Button
								variant="outline"
								onClick={handleDownloadZip}
								disabled={isRunning}
							>
								<FileArchive />
								{m.common_download_all_zip()}
							</Button>
						)}
						{(strippable.length > 0 || isRunning) && (
							<Button onClick={handleStrip} disabled={isRunning}>
								{isRunning ? <Loader2 className="animate-spin" /> : null}
								{isRunning
									? m.metadata_removing()
									: m.metadata_remove({ count: strippable.length })}
							</Button>
						)}
					</div>

					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<MetadataRow
								key={item.id}
								item={item}
								isRunning={isRunning}
								onRemove={() =>
									setItems((prev) => prev.filter((i) => i.id !== item.id))
								}
							/>
						))}
					</ul>
				</>
			)}
		</PageShell>
	);
}

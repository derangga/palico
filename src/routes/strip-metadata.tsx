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
			toast.error(`You can check up to ${MAX_FILES} files at a time.`);
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
				`Removed hidden data from ${ok} file${ok === 1 ? "" : "s"}.`,
			);
		}

		const failed = targets.length - ok;

		if (failed > 0) {
			toast.error(
				`${failed} file${failed === 1 ? "" : "s"} could not be cleaned.`,
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
			toast.error("Could not build the zip file.");

			return;
		}

		downloadBlob(exit.value, "palico-cleaned.zip");
	}

	return (
		<PageShell>
			<PageHeader title="Remove Metadata">
				See what your photos and PDFs reveal (location, camera, author, dates)
				and remove it. Files are checked and cleaned on your device and never
				uploaded.
			</PageHeader>

			<Dropzone
				label="Drag & drop photos or PDFs here, or"
				actionLabel="Choose files"
				hint={`JPEG, PNG and WebP up to ${MAX_FILE_BYTES / MB} MB, PDF up to ${MAX_PDF_BYTES / MB} MB, ${MAX_FILES} files at a time`}
				accept={ACCEPTED_MIME_TYPES.join(",")}
				multiple
				ariaLabel="Choose photos or PDFs to check"
				onFiles={addFiles}
			/>

			{items.length > 0 && (
				<>
					<div className="mt-6 flex flex-wrap items-center gap-2">
						<p className="mr-auto text-sm text-muted-foreground">
							{items.length} file{items.length === 1 ? "" : "s"}
						</p>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setItems([])}
							disabled={isRunning}
						>
							Clear all
						</Button>
						{cleanItems.length > 1 && (
							<Button
								variant="outline"
								onClick={handleDownloadZip}
								disabled={isRunning}
							>
								<FileArchive />
								Download all (.zip)
							</Button>
						)}
						{(strippable.length > 0 || isRunning) && (
							<Button onClick={handleStrip} disabled={isRunning}>
								{isRunning ? <Loader2 className="animate-spin" /> : null}
								{isRunning
									? "Removing…"
									: `Remove metadata (${strippable.length})`}
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

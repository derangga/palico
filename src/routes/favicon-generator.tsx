import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Option, Exit } from "effect";
import { Download, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import { SendTo } from "#/components/handoff/send-to.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import type { FaviconError, ZipError } from "#/lib/image/errors.ts";
import {
	bundleFaviconZip,
	type FaviconAsset,
	generateFavicons,
} from "#/lib/image/favicon.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/favicon-generator")({
	head: () => seoHead("/favicon-generator"),
	component: FaviconGeneratorPage,
});

type Status = "idle" | "processing" | "done";

const CHECKER_STYLE: React.CSSProperties = {
	backgroundImage:
		"linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
	backgroundSize: "16px 16px",
	backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function faviconErrorMessage(failure: FaviconError | undefined): string {
	switch (failure?._tag) {
		case "FileTooLargeError":
			return failure.message;
		case "DecodeError":
			return m.favicon_err_read();
		case "EncodeError":
			return m.favicon_err_generate();
		default:
			return m.favicon_err_generic();
	}
}

function FaviconGeneratorPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [source, setSource] = useState<File | null>(null);
	const [assets, setAssets] = useState<readonly FaviconAsset[] | null>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [zipping, setZipping] = useState(false);

	const sourceUrl = useMemo(
		() => (source ? URL.createObjectURL(source) : null),
		[source],
	);

	useEffect(() => {
		return () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);

	// Each asset gets its own object URL for the preview; revoke on unmount/change.
	const assetUrls = useMemo(() => {
		if (!assets) return null;

		return assets.map((a) => ({
			name: a.name,
			url: URL.createObjectURL(a.blob),
		}));
	}, [assets]);

	useEffect(() => {
		return () => {
			if (assetUrls) for (const a of assetUrls) URL.revokeObjectURL(a.url);
		};
	}, [assetUrls]);

	function pick() {
		fileInputRef.current?.click();
	}

	function reset() {
		setSource(null);
		setAssets(null);
		setStatus("idle");

		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	const handoff = useHandoff((files) => void selectFile(files), {
		hasFile: source !== null,
	});

	async function selectFile(files: FileList | null) {
		const file = files?.[0];

		if (!file) return;

		if (!file.type.startsWith("image/")) {
			toast.error(m.common_not_an_image({ name: file.name }));

			return;
		}

		setSource(file);
		setAssets(null);
		setStatus("processing");

		const exit = await Effect.runPromiseExit(generateFavicons(file));

		if (Exit.isSuccess(exit)) {
			setAssets(exit.value);
			setStatus("done");
			recordToolUse("/favicon-generator");

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (failure) console.error(failure);
		toast.error(faviconErrorMessage(failure));
		setSource(null);
		setStatus("idle");
	}

	async function downloadAll() {
		if (!assets) return;
		setZipping(true);
		const exit = await Effect.runPromiseExit(bundleFaviconZip(assets));
		setZipping(false);

		if (Exit.isSuccess(exit)) {
			downloadBlob(exit.value, "favicons.zip");

			return;
		}

		const failure: ZipError | undefined = Option.getOrUndefined(
			Cause.findErrorOption(exit.cause),
		);

		console.error(failure);
		toast.error(m.favicon_err_zip());
	}

	return (
		<PageShell>
			<PageHeader title={m.tool_favicon_generator_label()}>
				{m.favicon_description_before()} <code>{"<link>"}</code>{" "}
				{m.favicon_description_after()}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			<input
				ref={fileInputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(e) => {
					selectFile(e.target.files);
					e.target.value = "";
				}}
			/>

			{!source ? (
				<Empty className="border bg-card">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ImageIcon />
						</EmptyMedia>
						<EmptyTitle>{m.common_pick_image_title()}</EmptyTitle>
						<EmptyDescription>
							{m.favicon_pick_before()} <code>favicon.ico</code>
							{m.favicon_pick_after()}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={pick}>{m.common_choose_image()}</Button>
					</EmptyContent>
				</Empty>
			) : (
				<div className="flex flex-col gap-4">
					{/* Source preview */}
					<div className="flex items-center gap-3 rounded-xl border bg-card p-3">
						<div
							className="size-16 shrink-0 overflow-hidden rounded-lg border"
							style={CHECKER_STYLE}
						>
							{sourceUrl && (
								<img
									src={sourceUrl}
									alt={source.name}
									className="size-full object-contain"
								/>
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium">{source.name}</p>
							<p className="text-xs text-muted-foreground">
								{m.favicon_source_note()}
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={reset}
							disabled={status === "processing"}
						>
							<RotateCcw />
							{m.common_start_over()}
						</Button>
					</div>

					{status === "processing" && (
						<div className="flex items-center gap-3 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							{m.favicon_generating()}
						</div>
					)}

					{status === "done" && assetUrls && assets && (
						<>
							<h2 className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								{m.favicon_generated()}
							</h2>
							<ul className="flex flex-col gap-2">
								{assets.map((asset, i) => {
									const url = assetUrls[i]?.url;
									const isIco = asset.mime === "image/x-icon";

									const previewUrl = isIco
										? // .ico can't render in <img> reliably — show the 32px PNG.
											(assetUrls.find((u) => u.name === "favicon-32.png")
												?.url ?? url)
										: url;

									return (
										<li
											key={asset.name}
											className="flex items-center gap-3 rounded-lg border bg-card p-3"
										>
											<div
												className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border"
												style={CHECKER_STYLE}
											>
												{previewUrl && (
													<img
														src={previewUrl}
														alt={asset.name}
														width={asset.size}
														height={asset.size}
														className="max-h-full max-w-full"
														style={{ imageRendering: "pixelated" }}
													/>
												)}
											</div>
											<div className="flex min-w-0 flex-1 flex-col">
												<p className="truncate text-sm font-medium">
													{asset.name}
												</p>
												<p className="text-xs text-muted-foreground">
													{isIco
														? "16 + 32 + 48"
														: `${asset.size}×${asset.size}`}
												</p>
											</div>
											<Button
												variant="outline"
												size="sm"
												onClick={() => downloadBlob(asset.blob, asset.name)}
											>
												<Download />
												{m.common_save()}
											</Button>
										</li>
									);
								})}
							</ul>

							<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3">
								<p className="min-w-48 flex-1 text-xs text-muted-foreground">
									{m.favicon_zip_before()} <code>site.webmanifest</code>{" "}
									{m.favicon_zip_middle()} <code>{"<head>"}</code>{" "}
									{m.favicon_zip_after()}
								</p>
								{/* The PNG sizes only: the .ico is for browsers, not for other tools. */}
								<SendTo
									from="favicon_generator"
									outputs={assets.flatMap((asset) =>
										asset.mime === "image/png"
											? [{ blob: asset.blob, name: asset.name }]
											: [],
									)}
									className="ml-auto"
								/>
								<Button onClick={downloadAll} disabled={zipping}>
									{zipping ? (
										<Loader2 className="animate-spin" />
									) : (
										<Download />
									)}
									{m.common_download_all_zip()}
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</PageShell>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Download, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import type { FaviconError, ZipError } from "#/lib/image/errors.ts";
import {
	bundleFaviconZip,
	type FaviconAsset,
	generateFavicons,
} from "#/lib/image/favicon.ts";

export const Route = createFileRoute("/favicon-generator")({
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
			return "Couldn't read this image. Try a different file.";
		case "EncodeError":
			return "Couldn't generate the favicons from this image.";
		default:
			return "Failed to generate favicons.";
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

	async function selectFile(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(`"${file.name}" is not an image.`);
			return;
		}
		setSource(file);
		setAssets(null);
		setStatus("processing");

		const exit = await Effect.runPromiseExit(generateFavicons(file));
		if (exit._tag === "Success") {
			setAssets(exit.value);
			setStatus("done");
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
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
		if (exit._tag === "Success") {
			downloadBlob(exit.value, "favicons.zip");
			return;
		}
		const failure: ZipError | undefined =
			exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		console.error(failure);
		toast.error("Couldn't bundle the zip.");
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Favicon Generator</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Drop in a logo or icon and get every favicon size modern browsers,
					iOS, and Android need — plus a ready-to-paste <code>{"<link>"}</code>{" "}
					snippet. Everything runs on your device.
				</p>
			</div>

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
						<EmptyTitle>Pick an image to start</EmptyTitle>
						<EmptyDescription>
							We'll center-crop non-square images, flatten the Apple touch icon
							onto white, and bundle a real <code>favicon.ico</code>.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={pick}>Choose image</Button>
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
								Source image · center-cropped to square
							</p>
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={reset}
							disabled={status === "processing"}
						>
							<RotateCcw />
							Start over
						</Button>
					</div>

					{status === "processing" && (
						<div className="flex items-center gap-3 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Generating favicons…
						</div>
					)}

					{status === "done" && assetUrls && assets && (
						<>
							<h2 className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								Generated favicons
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
												Save
											</Button>
										</li>
									);
								})}
							</ul>

							<div className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3">
								<p className="text-xs text-muted-foreground">
									Zip includes <code>site.webmanifest</code> and a copy-paste{" "}
									<code>{"<head>"}</code> snippet.
								</p>
								<Button onClick={downloadAll} disabled={zipping}>
									{zipping ? (
										<Loader2 className="animate-spin" />
									) : (
										<Download />
									)}
									Download all (.zip)
								</Button>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Download, ImageIcon, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DownloadConsentDialog } from "#/components/download-consent-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import {
	type RemoveProgress,
	removeBackground,
} from "#/lib/image/background-removal.ts";
import type { BackgroundRemovalError } from "#/lib/image/errors.ts";

// One-time download the consent gate negotiates before the model is fetched.
const MODEL_SIZE_LABEL = "~180MB";

function userMessageFor(failure: BackgroundRemovalError | undefined): string {
	switch (failure?._tag) {
		case "FileTooLargeError":
			return failure.message;
		case "ModelLoadError":
			return "Couldn't prepare the background tool. Check your connection and try again.";
		case "InferenceError":
			return "Couldn't remove the background from this image. Try a different one.";
		case "DecodeError":
		case "EncodeError":
			return "Couldn't read this image.";
		default:
			return "Failed to remove background.";
	}
}

export const Route = createFileRoute("/background-removal")({
	component: BackgroundRemovalPage,
});

type Status = "idle" | "processing" | "done";

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function BackgroundRemovalPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [source, setSource] = useState<File | null>(null);
	const [result, setResult] = useState<Blob | null>(null);
	const [status, setStatus] = useState<Status>("idle");
	const [progress, setProgress] = useState<RemoveProgress | null>(null);
	const [consentOpen, setConsentOpen] = useState(false);
	// True once the model has downloaded this session (it lives in a module Ref).
	// Lets repeat images skip the consent gate. We can't cheaply detect a prior
	// visit's browser-cached model, so a fresh page load shows the gate again.
	const [modelLoaded, setModelLoaded] = useState(false);

	const sourceUrl = useMemo(
		() => (source ? URL.createObjectURL(source) : null),
		[source],
	);
	const resultUrl = useMemo(
		() => (result ? URL.createObjectURL(result) : null),
		[result],
	);
	useEffect(
		() => () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		},
		[sourceUrl],
	);
	useEffect(
		() => () => {
			if (resultUrl) URL.revokeObjectURL(resultUrl);
		},
		[resultUrl],
	);

	function pick() {
		fileInputRef.current?.click();
	}

	function selectFile(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(`"${file.name}" is not an image.`);
			return;
		}
		setSource(file);
		setResult(null);
		setStatus("idle");
		setProgress(null);
	}

	function reset() {
		setSource(null);
		setResult(null);
		setStatus("idle");
		setProgress(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	// Proceed gates on the one-time model download: show consent on first use,
	// then run straight through once the model is loaded for the session.
	function proceed() {
		if (!source) return;
		if (modelLoaded) {
			void runRemoval();
			return;
		}
		setConsentOpen(true);
	}

	function confirmDownload() {
		setConsentOpen(false);
		void runRemoval();
	}

	async function runRemoval() {
		if (!source) return;
		setStatus("processing");
		setProgress({ stage: "downloading", percent: 0 });

		const exit = await Effect.runPromiseExit(
			removeBackground({
				file: source,
				onProgress: (p) => {
					// Download finished once inference starts — the model is now cached
					// in the module Ref, so later images skip the consent gate.
					if (p.stage === "processing") setModelLoaded(true);
					setProgress(p);
				},
			}),
		);

		setProgress(null);

		if (exit._tag === "Success") {
			setResult(exit.value);
			setStatus("done");
			return;
		}

		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(userMessageFor(failure));
		setStatus("idle");
	}

	const processing = status === "processing";
	const downloading = progress?.stage === "downloading";
	const progressLabel = downloading
		? `Downloading model ${progress.percent ?? 0}%`
		: "Removing background…";
	const progressPercent = downloading ? (progress.percent ?? 0) : 100;
	const progressHint = downloading
		? "Fetching the model. Your browser caches it for next time."
		: "Running the model on your device. This can take a few seconds.";

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Remove Background</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Cut out the subject of any image — entirely in your browser. On first
					use, a ~180MB model downloads and is cached.
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
							Choose any image and we'll erase its background. Everything runs
							on your device — nothing is uploaded.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={pick}>Choose image</Button>
					</EmptyContent>
				</Empty>
			) : status !== "done" ? (
				<div className="rounded-xl border bg-card p-4">
					<div className="overflow-hidden rounded-lg border bg-muted">
						{sourceUrl && (
							<img
								src={sourceUrl}
								alt={source.name}
								className="mx-auto max-h-[480px] object-contain"
							/>
						)}
					</div>
					<p className="mt-3 truncate text-xs text-muted-foreground">
						{source.name}
					</p>
					{processing ? (
						<div className="mt-4 rounded-lg border bg-muted/40 p-4">
							<div className="flex items-center gap-3">
								<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
								<p className="text-sm font-medium">{progressLabel}</p>
							</div>
							<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-primary transition-[width] duration-150 ease-out"
									style={{ width: `${progressPercent}%` }}
								/>
							</div>
							<p className="mt-3 text-xs text-muted-foreground">
								{progressHint}
							</p>
						</div>
					) : (
						<div className="mt-4 flex items-center justify-end gap-2">
							<Button variant="ghost" onClick={reset}>
								Clear
							</Button>
							<Button onClick={proceed}>Proceed</Button>
						</div>
					)}
				</div>
			) : (
				<div className="rounded-xl border bg-card p-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<figure>
							<figcaption className="mb-2 text-xs font-medium text-muted-foreground">
								Original
							</figcaption>
							<div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted">
								{sourceUrl && (
									<img
										src={sourceUrl}
										alt="Original"
										className="max-h-full max-w-full object-contain"
									/>
								)}
							</div>
						</figure>
						<figure>
							<figcaption className="mb-2 text-xs font-medium text-muted-foreground">
								Background removed
							</figcaption>
							<div
								className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border"
								style={{
									backgroundImage:
										"linear-gradient(45deg, var(--muted) 25%, transparent 25%), linear-gradient(-45deg, var(--muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--muted) 75%), linear-gradient(-45deg, transparent 75%, var(--muted) 75%)",
									backgroundSize: "16px 16px",
									backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
								}}
							>
								{resultUrl && (
									<img
										src={resultUrl}
										alt="Background removed"
										className="max-h-full max-w-full object-contain"
									/>
								)}
							</div>
						</figure>
					</div>
					<div className="mt-4 flex items-center justify-end gap-2">
						<Button variant="ghost" onClick={reset}>
							<RotateCcw />
							Start over
						</Button>
						<Button
							onClick={() => {
								if (!result) return;
								const base = source.name.replace(/\.[^.]+$/, "");
								downloadBlob(result, `${base}-no-bg.png`);
							}}
						>
							<Download />
							Download PNG
						</Button>
					</div>
				</div>
			)}

			<DownloadConsentDialog
				open={consentOpen}
				onOpenChange={setConsentOpen}
				onConfirm={confirmDownload}
				icon={<ImageIcon />}
				title={`Download the background tool (${MODEL_SIZE_LABEL})`}
				description={
					<>
						Background removal runs entirely on your device, but it needs a
						one-time {MODEL_SIZE_LABEL} AI model. Your browser caches it after
						the first download, so future use is faster. Nothing leaves your
						browser.
					</>
				}
			/>
		</div>
	);
}

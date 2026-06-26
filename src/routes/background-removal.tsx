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
import {
	type RemoveProgress,
	removeBackground,
} from "#/lib/image/background-removal.ts";
import type { BackgroundRemovalError } from "#/lib/image/errors.ts";

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

	async function proceed() {
		if (!source) return;
		setStatus("processing");
		setProgress({ stage: "downloading", percent: 0 });

		const exit = await Effect.runPromiseExit(
			removeBackground({ file: source, onProgress: setProgress }),
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
	const loaderLabel =
		progress?.stage === "downloading"
			? `Preparing tools${progress.percent !== undefined ? ` ${progress.percent}%` : "…"}`
			: "Removing background…";

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
					<div className="mt-4 flex items-center justify-end gap-2">
						<Button variant="ghost" onClick={reset} disabled={processing}>
							Clear
						</Button>
						<Button onClick={proceed} disabled={processing}>
							{processing ? (
								<>
									<Loader2 className="animate-spin" />
									{loaderLabel}
								</>
							) : (
								"Proceed"
							)}
						</Button>
					</div>
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
		</div>
	);
}

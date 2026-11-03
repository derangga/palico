import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Option, Exit } from "effect";
import {
	CircleAlert,
	Download,
	ImageIcon,
	Loader2,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
	EngineCheckingSkeleton,
	EngineConsentCard,
} from "#/components/engine-consent-gate.tsx";
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
import {
	isBackgroundModelCached,
	isModelLoaded,
	loadBackgroundModel,
	removeBackground,
} from "#/lib/image/background-removal.ts";
import type { BackgroundRemovalError } from "#/lib/image/errors.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import type { StorageQuotaError } from "#/lib/offline/errors.ts";
import { guardedEngineLoad } from "#/lib/offline/gate.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";

// One-time download the consent gate negotiates before the model is fetched.
// ~180 MB weights + ~21 MB ONNX Runtime.
const MODEL_SIZE_LABEL = "~200MB";

function userMessageFor(
	failure: BackgroundRemovalError | StorageQuotaError | undefined,
): string {
	switch (failure?._tag) {
		case "FileTooLargeError":
		case "DimensionsTooLargeError":
		case "StorageQuotaError":
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

// Readiness of the one-time model download, gated on mount like the video
// engine. "consent" shows the inline Enable card; the dialog opens on click. "ready" reveals the image tool.
type GatePhase =
	| { kind: "checking" }
	| { kind: "consent" }
	| { kind: "downloading"; percent: number }
	| { kind: "ready" }
	| { kind: "error"; message: string };

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
	const [gate, setGate] = useState<GatePhase>({ kind: "checking" });
	const [source, setSource] = useState<File | null>(null);
	const [result, setResult] = useState<Blob | null>(null);
	const [status, setStatus] = useState<Status>("idle");

	const startDownload = useCallback(async () => {
		setGate({ kind: "downloading", percent: 0 });

		const exit = await offlineRuntime.runPromiseExit(
			guardedEngineLoad(
				"bg-model",
				loadBackgroundModel((p) => {
					if (p.stage === "downloading") {
						setGate({ kind: "downloading", percent: p.percent });
					}
				}),
			),
		);

		if (Exit.isSuccess(exit)) {
			setGate({ kind: "ready" });

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (failure) console.error(failure);
		setGate({
			kind: "error",
			message: userMessageFor(failure),
		});
	}, []);

	// On mount: if the model is already in this session's module Ref (SPA
	// re-navigation), skip straight to the tool. If a past visit stored it in the
	// Cache API, build it from there without asking again (no download happens).
	// Otherwise front the download with the consent gate.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const loaded = await Effect.runPromise(isModelLoaded);

			if (cancelled) return;

			if (loaded) return setGate({ kind: "ready" });
			const cached = await Effect.runPromise(isBackgroundModelCached);

			if (cancelled) return;

			if (cached) return void startDownload();
			setGate({ kind: "consent" });
		})();

		return () => {
			cancelled = true;
		};
	}, [startDownload]);

	const sourceUrl = useMemo(
		() => (source ? URL.createObjectURL(source) : null),
		[source],
	);

	const resultUrl = useMemo(
		() => (result ? URL.createObjectURL(result) : null),
		[result],
	);

	useEffect(() => {
		return () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);
	useEffect(() => {
		return () => {
			if (resultUrl) URL.revokeObjectURL(resultUrl);
		};
	}, [resultUrl]);

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
	}

	function reset() {
		setSource(null);
		setResult(null);
		setStatus("idle");

		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	// The gate guarantees the model is loaded before we reach here, so this is
	// pure inference — no download, no consent.
	async function proceed() {
		if (!source) return;
		setStatus("processing");

		const exit = await Effect.runPromiseExit(
			withBusy(removeBackground({ file: source })),
		);

		if (Exit.isSuccess(exit)) {
			setResult(exit.value);
			setStatus("done");

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (failure) console.error(failure);
		toast.error(userMessageFor(failure));
		setStatus("idle");
	}

	const processing = status === "processing";

	return (
		<PageShell>
			<PageHeader title="Remove Background">
				Cut out the subject of any image, entirely in your browser. On first
				use, a {MODEL_SIZE_LABEL} model downloads and is cached.
			</PageHeader>

			{gate.kind !== "ready" ? (
				<ModelGate gate={gate} onStart={startDownload} />
			) : (
				<>
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
									Choose any image and we'll erase its background. Everything
									runs on your device. Nothing is uploaded.
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
								<div className="mt-4 flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
									<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
									<div>
										<p className="text-sm font-medium">Removing background…</p>
										<p className="text-xs text-muted-foreground">
											Running the model on your device. This can take a few
											seconds.
										</p>
									</div>
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
				</>
			)}
		</PageShell>
	);
}

interface ModelGateProps {
	gate: GatePhase;
	onStart: () => void;
}

// The pre-tool gate: shown on mount until the model download is consented to
// and completes. Mirrors the video converter's EnginePanel.
function ModelGate({ gate, onStart }: ModelGateProps) {
	if (gate.kind === "error") {
		return (
			<div className="rounded-xl border border-destructive/30 bg-card p-6">
				<div className="flex items-start gap-3">
					<CircleAlert className="size-5 shrink-0 text-destructive" />
					<div className="flex-1">
						<p className="text-sm font-medium">
							Could not prepare the background tool
						</p>
						<p className="mt-1 text-sm text-muted-foreground">{gate.message}</p>
						<Button className="mt-4" onClick={onStart}>
							Try again
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (gate.kind === "checking") return <EngineCheckingSkeleton />;

	if (gate.kind === "consent") {
		return (
			<EngineConsentCard
				icon={ImageIcon}
				title="Background removal is disabled"
				body={`The ${MODEL_SIZE_LABEL} model download is required to use this tool.`}
				enableLabel="Enable background removal"
				dialogTitle={`Download the background tool (${MODEL_SIZE_LABEL})`}
				dialogDescription={
					<>
						Background removal runs entirely on your device, but it needs a
						one-time {MODEL_SIZE_LABEL} AI model. Your browser keeps it after
						the first download, so later visits work without a connection.
						Nothing leaves your browser.
					</>
				}
				onConfirm={onStart}
			/>
		);
	}

	const percent = gate.kind === "downloading" ? gate.percent : 100;

	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
				<p className="text-sm font-medium">Downloading model {percent}%</p>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full bg-primary transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				Fetching the model. Your browser caches it for next time.
			</p>
		</div>
	);
}

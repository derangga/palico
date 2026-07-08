import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Fiber, Option } from "effect";
import { Copy, Loader2, RotateCcw, ScanText, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { OcrError } from "#/lib/ocr/errors.ts";
import {
	isOcrReady,
	loadOcrLanguages,
	type OcrLanguage,
	type OcrProgress,
	type OcrResult,
	recognizeText,
} from "#/lib/ocr/ocr.ts";
import { preprocessForOcr } from "#/lib/ocr/preprocess.ts";
import { cn } from "#/lib/utils.ts";

export const Route = createFileRoute("/ocr")({ component: OcrPage });

// One-time download the consent dialog negotiates: WASM core + eng & ind packs.
const PACKS_SIZE_LABEL = "~20MB";

const LANGUAGES: ReadonlyArray<{ value: OcrLanguage; label: string }> = [
	{ value: "eng", label: "English" },
	{ value: "ind", label: "Indonesian" },
	{ value: "eng+ind", label: "Both" },
];

function userMessageFor(failure: OcrError | undefined): string {
	switch (failure?._tag) {
		case "OcrLoadError":
			return "Couldn't prepare the text reader. Check your connection and try again.";
		case "OcrRecognitionError":
			return "Couldn't read text from this image. Try a different one.";
		default:
			return "Something went wrong reading this image.";
	}
}

type Status = "idle" | "processing" | "done";

function progressLabel(progress: OcrProgress | null): string {
	if (progress?.stage === "downloading") {
		return `Downloading language packs… ${progress.percent}%`;
	}
	if (progress?.stage === "recognizing") {
		return `Reading text… ${progress.percent}%`;
	}
	return "Getting ready…";
}

function OcrPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const fiberRef = useRef<Fiber.RuntimeFiber<OcrResult, OcrError> | null>(null);

	const [source, setSource] = useState<File | null>(null);
	const [language, setLanguage] = useState<OcrLanguage>("eng+ind");
	const [status, setStatus] = useState<Status>("idle");
	const [progress, setProgress] = useState<OcrProgress | null>(null);
	const [result, setResult] = useState<OcrResult | null>(null);
	const [ready, setReady] = useState(false);
	const [consentOpen, setConsentOpen] = useState(false);

	// Whether the packs are already cached in this session (skips the dialog on a
	// second run). The IndexedDB cache also survives reloads, but we can't cheaply
	// detect that, so a fresh page load shows the dialog once more.
	useEffect(() => {
		let cancelled = false;
		Effect.runPromise(isOcrReady).then((v) => {
			if (!cancelled) setReady(v);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const sourceUrl = useMemo(
		() => (source ? URL.createObjectURL(source) : null),
		[source],
	);
	useEffect(() => {
		return () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);

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
		setProgress(null);
		if (fileInputRef.current) fileInputRef.current.value = "";
	}

	// Preprocess (best-effort) → recognize, downloading the packs first if this is
	// the first run. Runs as a forked fiber so Cancel can interrupt it, which
	// terminates the tesseract worker via the pipeline's acquireUseRelease.
	const run = useCallback((file: File, lang: OcrLanguage) => {
		setStatus("processing");
		setProgress(null);
		setResult(null);

		const program = Effect.gen(function* () {
			const cached = yield* isOcrReady;
			if (!cached) yield* loadOcrLanguages(setProgress);
			const prepared = yield* preprocessForOcr(file).pipe(
				Effect.orElseSucceed(() => file as Blob),
			);
			return yield* recognizeText({
				file: prepared,
				language: lang,
				onProgress: setProgress,
			});
		});

		const fiber = Effect.runFork(program);
		fiberRef.current = fiber;
		fiber.addObserver((exit) => {
			if (fiberRef.current !== fiber) return; // superseded by cancel/re-run
			fiberRef.current = null;
			if (Exit.isSuccess(exit)) {
				setReady(true);
				setResult(exit.value);
				setStatus("done");
				setProgress(null);
				return;
			}
			if (Cause.isInterruptedOnly(exit.cause)) return; // user cancelled
			const failure = Option.getOrUndefined(Cause.failureOption(exit.cause));
			console.error(exit.cause);
			toast.error(userMessageFor(failure));
			setStatus("idle");
			setProgress(null);
		});
	}, []);

	function proceed() {
		if (!source) return;
		if (ready) {
			run(source, language);
		} else {
			setConsentOpen(true);
		}
	}

	function cancel() {
		const fiber = fiberRef.current;
		fiberRef.current = null;
		if (fiber) Effect.runFork(Fiber.interrupt(fiber));
		setStatus("idle");
		setProgress(null);
	}

	const processing = status === "processing";

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Extract Text</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Pull the text out of any image — entirely in your browser. On first
					use, {PACKS_SIZE_LABEL} of language data downloads and is cached.
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
							<ScanText />
						</EmptyMedia>
						<EmptyTitle>Pick an image to start</EmptyTitle>
						<EmptyDescription>
							Choose a photo, screenshot, or scanned page and we'll read the
							text. Everything runs on your device — nothing is uploaded.
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
								className="mx-auto max-h-[420px] object-contain"
							/>
						)}
					</div>
					<p className="mt-3 truncate text-xs text-muted-foreground">
						{source.name} · runs on your device, nothing is uploaded
					</p>

					<div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<LanguageToggle
							value={language}
							onChange={setLanguage}
							disabled={processing}
						/>
						{processing ? (
							<div className="flex items-center gap-2">
								<Button variant="destructive" onClick={cancel}>
									<X />
									Cancel
								</Button>
								<Button disabled>
									<Loader2 className="animate-spin" />
									{progress?.stage === "downloading"
										? "Downloading…"
										: "Reading text…"}
								</Button>
							</div>
						) : (
							<div className="flex items-center gap-2">
								<Button variant="ghost" onClick={pick}>
									Change image
								</Button>
								<Button onClick={proceed}>Proceed</Button>
							</div>
						)}
					</div>

					{processing && (
						<div className="mt-4">
							<div className="flex items-center gap-3">
								<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
								<p className="text-sm font-medium">{progressLabel(progress)}</p>
							</div>
							<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
								<div
									className="h-full bg-primary transition-[width] duration-150 ease-out"
									style={{ width: `${progress?.percent ?? 0}%` }}
								/>
							</div>
						</div>
					)}
				</div>
			) : (
				<div className="rounded-xl border bg-card p-4">
					<textarea
						readOnly
						value={result?.text ?? ""}
						className="h-64 w-full resize-y rounded-lg border bg-background p-3 font-mono text-sm"
					/>
					<div className="mt-4 flex items-center justify-end gap-2">
						<Button variant="ghost" onClick={reset}>
							<RotateCcw />
							Start over
						</Button>
						<Button
							onClick={() => {
								navigator.clipboard.writeText(result?.text ?? "");
								toast.success("Copied to clipboard");
							}}
						>
							<Copy />
							Copy text
						</Button>
					</div>
				</div>
			)}

			<DownloadConsentDialog
				open={consentOpen}
				onOpenChange={setConsentOpen}
				onConfirm={() => {
					setConsentOpen(false);
					if (source) run(source, language);
				}}
				icon={<ScanText />}
				title={`Download the language data (${PACKS_SIZE_LABEL})`}
				description={
					<>
						Reading text runs entirely on your device, but it needs a one-time{" "}
						{PACKS_SIZE_LABEL} download of the English and Indonesian language
						data. Your browser caches it after the first download, so future use
						is instant. Nothing leaves your browser.
					</>
				}
			/>
		</div>
	);
}

interface LanguageToggleProps {
	value: OcrLanguage;
	onChange: (value: OcrLanguage) => void;
	disabled?: boolean;
}

function LanguageToggle({ value, onChange, disabled }: LanguageToggleProps) {
	return (
		<div
			role="radiogroup"
			aria-label="Recognition language"
			className="inline-flex rounded-md border bg-background p-0.5"
		>
			{LANGUAGES.map((lang) => {
				const active = value === lang.value;
				return (
					<label
						key={lang.value}
						className={cn(
							"cursor-pointer rounded-[0.25rem] px-3 py-1 text-sm font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
							active
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						<input
							type="radio"
							name="ocr-language"
							value={lang.value}
							checked={active}
							disabled={disabled}
							onChange={() => onChange(lang.value)}
							className="sr-only"
						/>
						{lang.label}
					</label>
				);
			})}
		</div>
	);
}

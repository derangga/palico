import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Fiber, Option } from "effect";
import {
	Copy,
	Loader2,
	RefreshCw,
	RotateCcw,
	ScanText,
	TriangleAlert,
	X,
} from "lucide-react";
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

// Below this mean word confidence (0–100), warn that the read looks unreliable.
const LOW_CONFIDENCE = 60;

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
	const [text, setText] = useState("");
	const [consentOpen, setConsentOpen] = useState(false);

	// Whether the packs are already cached in this session (skips the dialog on a
	// second run). Handler-only, so a ref avoids a needless re-render. The IndexedDB
	// cache also survives reloads, but we can't cheaply detect that, so a fresh page
	// load shows the dialog once more.
	const packsReadyRef = useRef(false);
	useEffect(() => {
		let cancelled = false;
		Effect.runPromise(isOcrReady).then((v) => {
			if (!cancelled) packsReadyRef.current = v;
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
				packsReadyRef.current = true;
				setResult(exit.value);
				setText(exit.value.text);
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
		if (packsReadyRef.current) {
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
				aria-label="Choose an image to read text from"
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
				<div className="grid animate-in grid-cols-1 gap-4 duration-300 fade-in sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] motion-reduce:animate-none">
					{/* Image shifts left; on mobile it collapses to a thumbnail on top. */}
					<div className="flex flex-col gap-3 animate-in duration-300 slide-in-from-left-2 motion-reduce:animate-none">
						<div className="flex items-center justify-center overflow-hidden rounded-lg border bg-muted">
							{sourceUrl && (
								<img
									src={sourceUrl}
									alt={source.name}
									className="max-h-32 object-contain sm:max-h-80"
								/>
							)}
						</div>
						<LanguageToggle
							value={language}
							onChange={setLanguage}
							disabled={false}
						/>
						<div className="flex items-center gap-2">
							<Button variant="ghost" onClick={reset}>
								<RotateCcw />
								Start over
							</Button>
							<Button
								variant="outline"
								onClick={() => {
									if (source) run(source, language);
								}}
							>
								<RefreshCw />
								Re-read
							</Button>
						</div>
					</div>

					{/* Result panel slides in from the right. */}
					<div className="flex flex-col gap-3 rounded-xl border bg-card p-4 animate-in duration-300 slide-in-from-right-3 motion-reduce:animate-none">
						<div className="flex items-center justify-between">
							<h2 className="text-sm font-semibold">Extracted text</h2>
							{text.trim() !== "" && (
								<Button
									size="icon-sm"
									variant="outline"
									aria-label="Copy text"
									onClick={() => {
										navigator.clipboard.writeText(text);
										toast.success("Copied to clipboard");
									}}
								>
									<Copy />
								</Button>
							)}
						</div>

						{result &&
							result.confidence < LOW_CONFIDENCE &&
							text.trim() !== "" && (
								<div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
									<TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
									<p className="text-xs text-muted-foreground">
										This looks unreliable — try a sharper image, or switch the
										language above and re-read.
									</p>
								</div>
							)}

						{text.trim() === "" ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background p-8 text-center">
								<ScanText className="size-8 text-muted-foreground" />
								<p className="text-sm font-medium">No text found</p>
								<p className="text-xs text-muted-foreground">
									We couldn't spot any readable text. Try a clearer image or a
									different language.
								</p>
							</div>
						) : (
							<textarea
								aria-label="Extracted text"
								value={text}
								onChange={(e) => setText(e.target.value)}
								className="min-h-64 w-full flex-1 resize-y rounded-lg border bg-background p-3 font-mono text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
							/>
						)}
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

import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Either, Exit, Option } from "effect";
import {
	Ban,
	Download,
	Film,
	Loader2,
	Pause,
	Play,
	Scissors,
	SkipBack,
	SkipForward,
	UploadCloud,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button.tsx";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { VideoTrimTimeline } from "#/components/video-trim-timeline.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize, classifyDevice, MB } from "#/lib/video/limits.ts";
import { generateThumbnails } from "#/lib/video/thumbnails.ts";
import {
	formatMeta,
	inputExtension,
	parseVideoOutputFormat,
} from "#/lib/video/types.ts";

export const Route = createFileRoute("/video-cutter")({
	component: VideoCutterPage,
});

const SKIP_SECONDS = 5;

function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / MB).toFixed(2)} MB`;
}

// mm:ss for the selection / output duration labels.
function formatTime(totalSeconds: number) {
	const s = Math.max(0, Math.floor(totalSeconds));
	const mins = Math.floor(s / 60);
	const secs = s % 60;
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

// Reads client globals and delegates to the pure classifier. Only ever called
// from user-event handlers, so navigator/window are safe (no SSR access).
function deviceClass() {
	return classifyDevice({
		userAgent: navigator.userAgent,
		viewportWidth: window.innerWidth,
	});
}

// The container label shown in the footer. types.ts is pure (no @ffmpeg/*), so
// importing it here doesn't pull the engine into the route bundle.
function formatLabelFor(file: File): string {
	const ext = inputExtension(file);
	const parsed = parseVideoOutputFormat(ext);
	return Either.isRight(parsed)
		? formatMeta(parsed.right).label
		: ext.toUpperCase();
}

function VideoCutterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CutterShell />;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Cutter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Trim a clip out of any video, entirely in your browser. The output
					keeps the original format.
				</p>
			</div>
			<VideoEnginePanel
				phase={gate.phase}
				declined={gate.declined}
				onStart={gate.startLoad}
				onDecline={gate.decline}
				icon={Scissors}
				consentDescription={
					<>
						Trimming runs entirely on your device, but the engine itself is a
						one-time {ENGINE_SIZE_LABEL} download. It is cached after the first
						load, so return visits are instant. Nothing leaves your browser.
					</>
				}
				disabledTitle="Video cutting is disabled"
				enableLabel="Enable video cutting"
			/>
		</div>
	);
}

interface TrimOutput {
	blob: Blob;
	name: string;
	size: number;
}

function CutterShell() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const objectUrlRef = useRef<string | null>(null);
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });

	const [file, setFile] = useState<File | null>(null);
	const [objectUrl, setObjectUrl] = useState<string | null>(null);
	const [duration, setDuration] = useState(0);
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [isPlaying, setIsPlaying] = useState(false);
	const [thumbnails, setThumbnails] = useState<string[]>([]);
	const [trimming, setTrimming] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [output, setOutput] = useState<TrimOutput | null>(null);

	// Revoke the preview URL when the component unmounts.
	useEffect(() => {
		return () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		};
	}, []);

	// Drive the playhead from a continuous rAF that reads the <video> element
	// directly, so it tracks smoothly during playback and stays correct on
	// seek/pause — independent of how reliably play/pause events fire. When
	// playback reaches the end of the selection we pause (no auto-loop) and clamp
	// the playhead to the end. (setCurrentTime with an unchanged value is a no-op
	// in React.)
	useEffect(() => {
		if (!objectUrl) return;
		let raf = 0;
		const tick = () => {
			const v = videoRef.current;
			if (v) {
				if (!v.paused && v.currentTime >= end) {
					v.pause();
					v.currentTime = end;
				}
				setCurrentTime(v.currentTime);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [objectUrl, end]);

	// Build the filmstrip as soon as a file is picked. Failure is non-fatal:
	// the timeline simply renders a plain track.
	useEffect(() => {
		if (!file) {
			setThumbnails([]);
			return;
		}
		let cancelled = false;
		Effect.runPromiseExit(generateThumbnails(file)).then((exit) => {
			if (cancelled) return;
			if (Exit.isSuccess(exit)) setThumbnails([...exit.value]);
		});
		return () => {
			cancelled = true;
		};
	}, [file]);

	function openFile(f: File) {
		if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		const url = URL.createObjectURL(f);
		objectUrlRef.current = url;
		setObjectUrl(url);
		setFile(f);
		setOutput(null);
		setIsPlaying(false);
		setThumbnails([]);
		setDuration(0);
		setStart(0);
		setEnd(0);
		setCurrentTime(0);
	}

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];
		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(`"${f.name}" is not a video.`);
			return;
		}
		// Output keeps the input container, so the input must be one we can mux.
		if (Either.isLeft(parseVideoOutputFormat(inputExtension(f)))) {
			toast.error("Supported formats: MP4, WebM, MOV, MKV, AVI.");
			return;
		}

		const verdict = checkCutterFileSize(f.size, deviceClass());
		if (verdict.kind === "rejected") {
			toast.error(
				`"${f.name}" is ${formatBytes(f.size)} — over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB.`,
			);
			return;
		}
		if (verdict.kind === "warn") {
			toast(
				`"${f.name}" is ${formatBytes(f.size)}. Large files use more memory while trimming.`,
			);
		}

		openFile(f);
	}

	function onLoadedMetadata() {
		const v = videoRef.current;
		if (!v) return;
		const d = Number.isFinite(v.duration) ? v.duration : 0;
		setDuration(d);
		setStart(0);
		setEnd(d);
		setCurrentTime(0);
	}

	function seekTo(sec: number) {
		const v = videoRef.current;
		if (!v) return;
		const clamped = Math.min(Math.max(sec, 0), duration || 0);
		v.currentTime = clamped;
		setCurrentTime(clamped);
	}

	function togglePlay() {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) {
			if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
			void v.play();
		} else {
			v.pause();
		}
	}

	function changeStart(sec: number) {
		setStart(sec);
		if (currentTime < sec) seekTo(sec);
	}

	function changeEnd(sec: number) {
		setEnd(sec);
		if (currentTime > sec) seekTo(sec);
	}

	function reset() {
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
		setObjectUrl(null);
		setFile(null);
		setOutput(null);
		setIsPlaying(false);
	}

	async function handleProceed() {
		if (!file) return;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		setTrimming(true);
		setOutput(null);

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. loadEngine is
			// idempotent (no-op when loaded; fast cache-backed re-init after a cancel
			// terminated the worker).
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));
			if (token.cancelled) return;

			const { trimVideo } = await import("#/lib/video/trim.ts");
			const exit = await Effect.runPromiseExit(
				trimVideo(
					{ file, startSec: start, endSec: end },
					() => token.cancelled,
				),
			);
			if (token.cancelled) return;

			if (Exit.isSuccess(exit)) {
				const out = exit.value;
				setOutput({ blob: out.blob, name: out.name, size: out.size });
				toast.success("Your trimmed clip is ready — hit Save to download it.");
			} else {
				// Both failure types (EngineNotLoadedError | VideoTrimError) carry a
				// typed `message`; defects (non-Fail causes) fall back to a generic.
				const message = Option.match(Cause.failureOption(exit.cause), {
					onNone: () => "Could not trim the video.",
					onSome: (error) => error.message,
				});
				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Video trimming failed unexpectedly.",
			);
		} finally {
			if (!token.cancelled) setTrimming(false);
		}
	}

	async function handleCancel() {
		cancelTokenRef.current.cancelled = true;
		setCancelling(true);
		try {
			const { disposeEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(disposeEngine);
		} finally {
			setTrimming(false);
			setCancelling(false);
		}
	}

	const outputDuration = Math.max(0, end - start);
	const canProceed = duration > 0 && outputDuration > 0 && !trimming;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10 min-[769px]:max-w-6xl">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Cutter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Trim a clip out of any video, entirely in your browser. The output
					keeps the original format.
				</p>
			</div>

			{!file ? (
				// biome-ignore lint/a11y/noStaticElementInteractions: dropzone wraps a real file input.
				<div
					onDragOver={(e) => e.preventDefault()}
					onDrop={(e) => {
						e.preventDefault();
						addFiles(e.dataTransfer.files);
					}}
					className="rounded-xl border border-dashed bg-card p-8 text-center"
				>
					<UploadCloud className="mx-auto size-8 text-muted-foreground" />
					<p className="mt-3 text-sm font-medium">
						Drag &amp; drop a video here, or
					</p>
					<Button
						variant="outline"
						size="sm"
						className="mt-3"
						onClick={() => fileInputRef.current?.click()}
					>
						Choose a video
					</Button>
					<input
						id={inputId}
						ref={fileInputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={(e) => {
							addFiles(e.target.files);
							e.target.value = "";
						}}
					/>
				</div>
			) : (
				// Desktop (>768px): video/controls/trim on the wide left column, the
				// format/duration/proceed panel + result on a sticky right column, so
				// finishing a trim never shoves the player around. Mobile/tablet
				// (≤768px) collapses to a single stacked column.
				<div className="grid items-start gap-4 min-[769px]:grid-cols-[minmax(0,1fr)_22rem]">
					{/* Left: preview + controls + trim */}
					<div className="flex min-w-0 flex-col gap-2">
						{/* biome-ignore lint/a11y/useMediaCaption: user-supplied local video; no captions available. */}
						<video
							ref={videoRef}
							src={objectUrl ?? undefined}
							onLoadedMetadata={onLoadedMetadata}
							onPlay={() => setIsPlaying(true)}
							onPause={() => setIsPlaying(false)}
							className="max-h-[60vh] w-full rounded-xl border bg-black"
						/>

						{/* Playback controls: time readout above a centered button row. */}
						<div className="flex flex-col items-center gap-2">
							<span className="font-mono text-xs text-muted-foreground tabular-nums">
								{formatTime(currentTime)} / {formatTime(duration)}
							</span>
							<div className="flex items-center justify-center gap-2">
								<Button
									variant="outline"
									size="icon-sm"
									aria-label="Back 5 seconds"
									onClick={() => seekTo(currentTime - SKIP_SECONDS)}
								>
									<SkipBack />
								</Button>
								<Button
									size="icon-sm"
									aria-label={isPlaying ? "Pause" : "Play"}
									onClick={togglePlay}
								>
									{isPlaying ? <Pause /> : <Play />}
								</Button>
								<Button
									variant="outline"
									size="icon-sm"
									aria-label="Forward 5 seconds"
									onClick={() => seekTo(currentTime + SKIP_SECONDS)}
								>
									<SkipForward />
								</Button>
							</div>
						</div>

						{/* Trim selection */}
						<VideoTrimTimeline
							duration={duration}
							start={start}
							end={end}
							currentTime={currentTime}
							thumbnails={thumbnails}
							disabled={trimming}
							onChangeStart={changeStart}
							onChangeEnd={changeEnd}
							onScrub={seekTo}
						/>

						<p className="text-xs text-muted-foreground">
							Cuts snap to the nearest keyframe, so the clip may start up to a
							second or two before your selection.
						</p>
					</div>

					{/* Right: format · duration · proceed, then the result */}
					<div className="flex flex-col gap-4 min-[769px]:sticky min-[769px]:top-20">
						<div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs text-muted-foreground">
									Current video format
								</span>
								<span className="text-sm font-medium">
									{file ? formatLabelFor(file) : "—"}
								</span>
							</div>
							<div className="flex items-center justify-between gap-4">
								<span className="text-xs text-muted-foreground">
									Output duration
								</span>
								<span className="text-sm font-medium tabular-nums">
									{formatTime(outputDuration)}
								</span>
							</div>

							{trimming ? (
								<Button
									variant="outline"
									className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
									onClick={handleCancel}
									disabled={cancelling}
								>
									{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
									{cancelling ? "Cancelling…" : "Cancel"}
								</Button>
							) : (
								<Button variant="ghost" className="w-full" onClick={reset}>
									Choose another
								</Button>
							)}

							<Button
								className="w-full"
								onClick={handleProceed}
								disabled={!canProceed}
							>
								{trimming ? <Loader2 className="animate-spin" /> : <Scissors />}
								{trimming ? "Trimming…" : "Proceed"}
							</Button>
						</div>

						{output && (
							<div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 py-2.5">
								<Film className="size-4 shrink-0 text-muted-foreground" />
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{output.name}</p>
									<p className="text-xs text-muted-foreground">
										{formatBytes(output.size)}
									</p>
								</div>
								<Button onClick={() => downloadBlob(output.blob, output.name)}>
									<Download />
									Save
								</Button>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

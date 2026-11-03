import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Either, Exit, Option } from "effect";
import { Scissors } from "lucide-react";
import { useEffect, useReducer, useRef } from "react";
import { toast } from "sonner";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CutterStage } from "#/components/video-cutter/cutter-stage.tsx";
import {
	cutterReducer,
	initialCutterState,
} from "#/components/video-cutter/state.ts";
import { TrimPanel } from "#/components/video-cutter/trim-panel.tsx";
import { deviceClass, formatBytes } from "#/components/video-cutter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize } from "#/lib/video/limits.ts";
import { generateThumbnails } from "#/lib/video/thumbnails.ts";
import { inputExtension, parseVideoOutputFormat } from "#/lib/video/types.ts";

export const Route = createFileRoute("/video-cutter")({
	component: VideoCutterPage,
});

const SKIP_SECONDS = 5;

// Static consent copy — hoisted to module scope so it isn't rebuilt each render
// and doesn't force VideoEnginePanel to redraw.
const CUTTER_CONSENT_DESCRIPTION = (
	<>
		Trimming runs entirely on your device, but the engine itself is a one-time{" "}
		{ENGINE_SIZE_LABEL} download. It is cached after the first load, so return
		visits are instant. Nothing leaves your browser.
	</>
);

function VideoCutterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CutterShell />;

	return (
		<PageShell>
			<PageHeader title="Video Cutter">
				Trim a clip out of any video, entirely in your browser. The output keeps
				the original format.
			</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={Scissors}
				consentDescription={CUTTER_CONSENT_DESCRIPTION}
				disabledTitle="Video cutting is disabled"
				enableLabel="Enable video cutting"
			/>
		</PageShell>
	);
}

function CutterShell() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const objectUrlRef = useRef<string | null>(null);
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });

	const [state, dispatch] = useReducer(cutterReducer, initialCutterState);
	const {
		file,
		objectUrl,
		duration,
		start,
		end,
		currentTime,
		isPlaying,
		thumbnails,
		trimming,
		cancelling,
		output,
	} = state;

	// Revoke the preview URL when the component unmounts. Reading
	// objectUrlRef.current at unmount is intentional — it revokes whatever URL
	// is current then; earlier URLs are already revoked on file-change and clear.
	// react-doctor-disable-next-line react-doctor/exhaustive-deps
	useEffect(() => {
		return () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		};
	}, []);

	// Drive the playhead from a continuous rAF that reads the <video> element
	// directly, so it tracks smoothly during playback and stays correct on
	// seek/pause — independent of how reliably play/pause events fire. When
	// playback reaches the end of the selection we pause (no auto-loop) and clamp
	// the playhead to the end.
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
				dispatch({ type: "setCurrentTime", value: v.currentTime });
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
			dispatch({ type: "setThumbnails", value: [] });
			return;
		}
		let cancelled = false;
		Effect.runPromiseExit(generateThumbnails(file)).then((exit) => {
			if (cancelled) return;
			if (Exit.isSuccess(exit))
				dispatch({ type: "setThumbnails", value: [...exit.value] });
		});
		return () => {
			cancelled = true;
		};
	}, [file]);

	function openFile(f: File) {
		if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		const url = URL.createObjectURL(f);
		objectUrlRef.current = url;
		dispatch({ type: "openFile", file: f, objectUrl: url });
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
				`"${f.name}" is ${formatBytes(f.size)}, over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB.`,
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
		dispatch({ type: "loadedMetadata", duration: d });
	}

	function seekTo(sec: number) {
		const v = videoRef.current;
		if (!v) return;
		const clamped = Math.min(Math.max(sec, 0), duration || 0);
		v.currentTime = clamped;
		dispatch({ type: "setCurrentTime", value: clamped });
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
		dispatch({ type: "setStart", value: sec });
		if (currentTime < sec) seekTo(sec);
	}

	function changeEnd(sec: number) {
		dispatch({ type: "setEnd", value: sec });
		if (currentTime > sec) seekTo(sec);
	}

	function reset() {
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}
		dispatch({ type: "reset" });
	}

	async function handleProceed() {
		if (!file) return;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "trimStart" });

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. loadEngine is
			// idempotent (no-op when loaded; fast cache-backed re-init after a cancel
			// terminated the worker).
			// Await-before-guard is intentional: the guard below catches a cancel
			// that lands during the (potentially slow) engine load, so the await
			// must run before it — not after.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));
			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
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
				dispatch({
					type: "trimSuccess",
					output: { blob: out.blob, name: out.name, size: out.size },
				});
				toast.success("Your trimmed clip is ready. Hit Save to download it.");
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
			if (!token.cancelled) dispatch({ type: "trimEnd" });
		}
	}

	async function handleCancel() {
		cancelTokenRef.current.cancelled = true;
		dispatch({ type: "cancelStart" });
		try {
			const { disposeEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(disposeEngine);
		} finally {
			dispatch({ type: "cancelEnd" });
		}
	}

	const outputDuration = Math.max(0, end - start);
	const canProceed = duration > 0 && outputDuration > 0 && !trimming;

	return (
		<PageShell className="min-[769px]:max-w-6xl">
			<PageHeader title="Video Cutter">
				Trim a clip out of any video, entirely in your browser. The output keeps
				the original format.
			</PageHeader>

			{!file ? (
				<Dropzone
					label="Drag & drop a video here, or"
					actionLabel="Choose a video"
					hint="One video file at a time"
					accept="video/*"
					ariaLabel="Choose a video to trim"
					onFiles={addFiles}
				/>
			) : (
				// Desktop (>768px): video/controls/trim on the wide left column, the
				// format/duration/proceed panel + result on a sticky right column, so
				// finishing a trim never shoves the player around. Mobile/tablet
				// (≤768px) collapses to a single stacked column.
				<div className="grid items-start gap-4 min-[769px]:grid-cols-[minmax(0,1fr)_22rem]">
					<CutterStage
						videoRef={videoRef}
						objectUrl={objectUrl}
						currentTime={currentTime}
						duration={duration}
						isPlaying={isPlaying}
						start={start}
						end={end}
						thumbnails={thumbnails}
						trimming={trimming}
						onLoadedMetadata={onLoadedMetadata}
						onPlay={() => dispatch({ type: "setPlaying", value: true })}
						onPause={() => dispatch({ type: "setPlaying", value: false })}
						onSeekBack={() => seekTo(currentTime - SKIP_SECONDS)}
						onSeekForward={() => seekTo(currentTime + SKIP_SECONDS)}
						onTogglePlay={togglePlay}
						onChangeStart={changeStart}
						onChangeEnd={changeEnd}
						onScrub={seekTo}
					/>

					<TrimPanel
						file={file}
						outputDuration={outputDuration}
						trimming={trimming}
						cancelling={cancelling}
						canProceed={canProceed}
						output={output}
						onCancel={handleCancel}
						onReset={reset}
						onProceed={handleProceed}
					/>
				</div>
			)}
		</PageShell>
	);
}

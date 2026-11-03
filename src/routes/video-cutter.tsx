import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option, Result } from "effect";
import { Scissors } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { VideoClipStage } from "#/components/video-clip-stage.tsx";
import {
	cutterReducer,
	initialCutterState,
} from "#/components/video-cutter/state.ts";
import { TrimPanel } from "#/components/video-cutter/trim-panel.tsx";
import { deviceClass, formatBytes } from "#/components/video-cutter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useClipPlayer } from "#/hooks/use-clip-player.ts";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize } from "#/lib/video/limits.ts";
import { inputExtension, parseVideoOutputFormat } from "#/lib/video/types.ts";

export const Route = createFileRoute("/video-cutter")({
	component: VideoCutterPage,
});

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
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const player = useClipPlayer();
	const { file, duration, start, end } = player;

	const [state, dispatch] = useReducer(cutterReducer, initialCutterState);
	const { trimming, cancelling, output } = state;

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];
		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(`"${f.name}" is not a video.`);
			return;
		}
		// Output keeps the input container, so the input must be one we can mux.
		if (Result.isFailure(parseVideoOutputFormat(inputExtension(f)))) {
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

		player.openFile(f);
		dispatch({ type: "clearOutput" });
	}

	function reset() {
		player.reset();
		dispatch({ type: "clearOutput" });
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
				withBusy(
					trimVideo(
						{ file, startSec: start, endSec: end },
						() => token.cancelled,
					),
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
				const message = Option.match(Cause.findErrorOption(exit.cause), {
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
					<VideoClipStage
						player={player}
						disabled={trimming}
						note="Cuts snap to the nearest keyframe, so the clip may start up to a second or two before your selection."
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

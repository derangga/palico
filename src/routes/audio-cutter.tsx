import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option } from "effect";
import { AudioWaveform } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";

import { AudioClipStage } from "#/components/audio-clip-stage.tsx";
import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
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
import { seoHead } from "#/lib/seo.ts";
import { audioCutFormat } from "#/lib/video/audio.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize } from "#/lib/video/limits.ts";

export const Route = createFileRoute("/audio-cutter")({
	head: () => seoHead("/audio-cutter"),
	component: AudioCutterPage,
});

// Static consent copy, hoisted so it is not rebuilt each render.
const AUDIO_CUTTER_CONSENT_DESCRIPTION = (
	<>
		Trimming runs entirely on your device, but the engine itself is a one-time{" "}
		{ENGINE_SIZE_LABEL} download. It is cached after the first load, so return
		visits are instant. Nothing leaves your browser.
	</>
);

const INTRO =
	"Trim a clip out of any audio file, entirely in your browser. The output keeps the original format.";

function AudioCutterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CutterShell />;

	return (
		<PageShell>
			<PageHeader title="Audio Cutter">{INTRO}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={AudioWaveform}
				consentDescription={AUDIO_CUTTER_CONSENT_DESCRIPTION}
				disabledTitle="Audio cutting is disabled"
				enableLabel="Enable audio cutting"
			/>
		</PageShell>
	);
}

function CutterShell() {
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const player = useClipPlayer<HTMLAudioElement>({ filmstrip: false });
	const { file, duration, start, end } = player;

	const [state, dispatch] = useReducer(cutterReducer, initialCutterState);
	const { trimming, cancelling, output } = state;

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];

		if (!f) return;

		// The output keeps the input container, so the input must be one we can
		// copy back out. The extension decides: FLAC and Opus often have no MIME type.
		if (Option.isNone(audioCutFormat(f))) {
			toast.error("Supported formats: MP3, M4A, WAV, OGG, Opus, FLAC.");

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

	function handleUnplayable() {
		// A media error mid-trim must not drop the file under the running job.
		if (trimming) return;

		toast.error(
			"This browser cannot play that audio file. Try another format.",
		);
		reset();
	}

	async function handleProceed() {
		if (!file) return;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "trimStart" });

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. loadEngine is
			// idempotent (no-op when loaded; fast cache-backed re-init after a cancel
			// terminated the worker). The guard below catches a cancel that lands
			// during the engine load, so the await must run before it.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));

			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { trimAudio } = await import("#/lib/video/audio-trim.ts");

			const exit = await Effect.runPromiseExit(
				withBusy(
					trimAudio(
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
				// Both failure types (EngineNotLoadedError | AudioTrimError) carry a
				// typed `message`; defects fall back to a generic one.
				const message = Option.match(Cause.findErrorOption(exit.cause), {
					onNone: () => "Could not trim the audio.",
					onSome: (error) => error.message,
				});

				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Audio trimming failed unexpectedly.",
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
			<PageHeader title="Audio Cutter">{INTRO}</PageHeader>

			{!file ? (
				<Dropzone
					label="Drag & drop an audio file here, or"
					actionLabel="Choose an audio file"
					hint="MP3, M4A, WAV, OGG, Opus or FLAC. One file at a time"
					accept="audio/*,.flac,.opus"
					ariaLabel="Choose an audio file to trim"
					onFiles={addFiles}
				/>
			) : (
				// Desktop (>768px): waveform and controls on the wide left column, the
				// panel and result on a sticky right column, so finishing a trim never
				// shoves the waveform around. Mobile (≤768px) stacks.
				<div className="grid items-start gap-4 min-[769px]:grid-cols-[minmax(0,1fr)_22rem]">
					<AudioClipStage
						player={player}
						disabled={trimming}
						onUnplayable={handleUnplayable}
					/>

					<TrimPanel
						file={file}
						formatTitle="Current audio format"
						ResultIcon={AudioWaveform}
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

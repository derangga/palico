import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option } from "effect";
import { AudioLines } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";
import { Dropzone } from "#/components/dropzone.tsx";
import { AudioPanel } from "#/components/extract-audio/audio-panel.tsx";
import {
	extractReducer,
	initialExtractState,
} from "#/components/extract-audio/state.ts";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { deviceClass, formatBytes } from "#/components/video-cutter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize } from "#/lib/video/limits.ts";

export const Route = createFileRoute("/extract-audio")({
	component: ExtractAudioPage,
});

const AUDIO_CONSENT_DESCRIPTION = (
	<>
		Audio is extracted entirely on your device, but the engine itself is a
		one-time {ENGINE_SIZE_LABEL} download. It is cached after the first load, so
		return visits are instant. Nothing leaves your browser.
	</>
);

const INTRO =
	"Save the sound of any video as MP3, M4A, Opus or WAV, entirely in your browser.";

function ExtractAudioPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <ExtractShell />;

	return (
		<PageShell>
			<PageHeader title="Extract Audio">{INTRO}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={AudioLines}
				consentDescription={AUDIO_CONSENT_DESCRIPTION}
				disabledTitle="Audio extraction is disabled"
				enableLabel="Enable audio extraction"
			/>
		</PageShell>
	);
}

function ExtractShell() {
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const [state, dispatch] = useReducer(extractReducer, initialExtractState);
	const { file, format, extracting, cancelling, percent, output } = state;

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];
		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(`"${f.name}" is not a video.`);
			return;
		}

		// The video stream is never decoded, so memory is mostly the staged file:
		// the cutter's larger caps apply.
		const verdict = checkCutterFileSize(f.size, deviceClass());
		if (verdict.kind === "rejected") {
			toast.error(
				`"${f.name}" is ${formatBytes(f.size)}, over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB.`,
			);
			return;
		}
		if (verdict.kind === "warn") {
			toast(
				`"${f.name}" is ${formatBytes(f.size)}. Large files use more memory while extracting.`,
			);
		}

		dispatch({ type: "openFile", file: f });
	}

	async function handleExtract() {
		if (!file) return;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "extractStart" });

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. The guard after
			// loadEngine catches a cancel that lands during the engine load.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));
			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { extractAudio } = await import("#/lib/video/extract-audio.ts");
			const exit = await Effect.runPromiseExit(
				withBusy(
					extractAudio(
						{ file, format },
						() => token.cancelled,
						(p) => {
							if (!token.cancelled) dispatch({ type: "progress", percent: p });
						},
					),
				),
			);
			if (token.cancelled) return;

			if (Exit.isSuccess(exit)) {
				const out = exit.value;
				dispatch({
					type: "extractSuccess",
					output: { blob: out.blob, name: out.name, size: out.size },
				});
				toast.success(
					out.copied
						? "Your audio is ready, with the original sound kept as is. Hit Save to download it."
						: "Your audio is ready. Hit Save to download it.",
				);
			} else {
				// Every failure (EngineNotLoadedError | NoAudioTrackError |
				// AudioExtractError) carries a typed, user-facing `message`.
				const message = Option.match(Cause.failureOption(exit.cause), {
					onNone: () => "Could not extract the audio.",
					onSome: (error) => error.message,
				});
				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Extracting the audio failed unexpectedly.",
			);
		} finally {
			if (!token.cancelled) dispatch({ type: "extractEnd" });
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

	return (
		<PageShell>
			<PageHeader title="Extract Audio">{INTRO}</PageHeader>

			{!file ? (
				<Dropzone
					label="Drag & drop a video here, or"
					actionLabel="Choose a video"
					hint="One video file at a time"
					accept="video/*"
					ariaLabel="Choose a video to extract audio from"
					onFiles={addFiles}
				/>
			) : (
				<AudioPanel
					file={file}
					format={format}
					extracting={extracting}
					cancelling={cancelling}
					percent={percent}
					output={output}
					onChangeFormat={(value) => dispatch({ type: "setFormat", value })}
					onCancel={handleCancel}
					onReset={() => dispatch({ type: "reset" })}
					onExtract={handleExtract}
				/>
			)}
		</PageShell>
	);
}

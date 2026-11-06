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
import { checkCutterFileSize, overCapMessage } from "#/lib/video/limits.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/audio-cutter")({
	head: () => seoHead("/audio-cutter"),
	component: AudioCutterPage,
});

// Static consent copy, hoisted so it is not rebuilt each render.
// Functions, not constants: a constant would keep the language it was built in.
const consentDescription = () =>
	`${m.audiocut_consent({ size: ENGINE_SIZE_LABEL })} ${m.video_engine_consent_tail()}`;

const intro = () => m.audiocut_intro();

function AudioCutterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CutterShell />;

	return (
		<PageShell>
			<PageHeader title={m.tool_audio_cutter_label()}>{intro()}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={AudioWaveform}
				consentDescription={consentDescription()}
				disabledTitle={m.audiocut_disabled()}
				enableLabel={m.audiocut_enable()}
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
			toast.error(m.error_audio_formats());

			return;
		}

		const verdict = checkCutterFileSize(f.size, deviceClass());

		if (verdict.kind === "rejected") {
			toast.error(overCapMessage(f.name, formatBytes(f.size), verdict.capMB));

			return;
		}

		if (verdict.kind === "warn") {
			toast(
				m.common_large_file_notice({
					name: f.name,
					size: formatBytes(f.size),
					note: m.videocut_large_note(),
				}),
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

		toast.error(m.audiocut_unplayable());
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
				toast.success(`${m.videocut_ready()} ${m.common_output_ready_hint()}`);
			} else {
				// Both failure types (EngineNotLoadedError | AudioTrimError) carry a
				// typed `message`; defects fall back to a generic one.
				const message = Option.match(Cause.findErrorOption(exit.cause), {
					onNone: () => m.audiocut_failed(),
					onSome: (error) => error.message,
				});

				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(err instanceof Error ? err.message : m.audiocut_unexpected());
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
			<PageHeader title={m.tool_audio_cutter_label()}>{intro()}</PageHeader>

			{!file ? (
				<Dropzone
					label={m.audiocut_dropzone_label()}
					actionLabel={m.audiocut_choose()}
					hint={m.audiocut_hint()}
					accept="audio/*,.flac,.opus"
					ariaLabel={m.audiocut_dropzone_aria()}
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
						formatTitle={m.trim_current_audio_format()}
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

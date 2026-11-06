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
import { seoHead } from "#/lib/seo.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { checkCutterFileSize, overCapMessage } from "#/lib/video/limits.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/extract-audio")({
	head: () => seoHead("/extract-audio"),
	component: ExtractAudioPage,
});

// Functions, not constants: a constant would keep the language it was built in.
const consentDescription = () =>
	`${m.extract_consent({ size: ENGINE_SIZE_LABEL })} ${m.video_engine_consent_tail()}`;

const intro = () => m.extract_intro();

function ExtractAudioPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <ExtractShell />;

	return (
		<PageShell>
			<PageHeader title={m.tool_extract_audio_label()}>{intro()}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={AudioLines}
				consentDescription={consentDescription()}
				disabledTitle={m.extract_disabled()}
				enableLabel={m.extract_enable()}
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
			toast.error(m.common_not_a_video({ name: f.name }));

			return;
		}

		// The video stream is never decoded, so memory is mostly the staged file:
		// the cutter's larger caps apply.
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
					note: m.extract_large_note(),
				}),
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
						? `${m.extract_ready_copied()} ${m.common_output_ready_hint()}`
						: `${m.extract_ready()} ${m.common_output_ready_hint()}`,
				);
			} else {
				// Every failure (EngineNotLoadedError | NoAudioTrackError |
				// AudioExtractError) carries a typed, user-facing `message`.
				const message = Option.match(Cause.findErrorOption(exit.cause), {
					onNone: () => m.extract_failed(),
					onSome: (error) => error.message,
				});

				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(err instanceof Error ? err.message : m.extract_unexpected());
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
			<PageHeader title={m.tool_extract_audio_label()}>{intro()}</PageHeader>

			{!file ? (
				<Dropzone
					label={m.videocut_dropzone_label()}
					actionLabel={m.common_choose_a_video()}
					hint={m.video_hint_one_file()}
					accept="video/*"
					ariaLabel={m.extract_dropzone_aria()}
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

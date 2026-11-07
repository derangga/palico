import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option, Predicate } from "effect";
import { Minimize2 } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CompressPanel } from "#/components/video-compressor/compress-panel.tsx";
import {
	compressReducer,
	initialCompressState,
	resolveMode,
} from "#/components/video-compressor/state.ts";
import { deviceClass, formatBytes } from "#/components/video-cutter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { CompressMode, CompressOutput } from "#/lib/video/compress-options.ts";
import { checkFileSize, overCapMessage } from "#/lib/video/limits.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/video-compressor")({
	head: () => seoHead("/video-compressor"),
	component: VideoCompressorPage,
});

// Functions, not constants: a constant would keep the language it was built in.
const consentDescription = () =>
	`${m.videocomp_consent({ size: ENGINE_SIZE_LABEL })} ${m.video_engine_consent_tail()}`;

const intro = () => m.videocomp_intro();

function VideoCompressorPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CompressShell />;

	return (
		<PageShell>
			<PageHeader title={m.tool_video_compressor_label()}>{intro()}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={Minimize2}
				consentDescription={consentDescription()}
				disabledTitle={m.videocomp_disabled()}
				enableLabel={m.videocomp_enable()}
			/>
		</PageShell>
	);
}

function CompressShell() {
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const [state, dispatch] = useReducer(compressReducer, initialCompressState);
	const { file } = state;

	const handoff = useHandoff(addFiles, { hasFile: file !== null });

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];

		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(m.common_not_a_video({ name: f.name }));

			return;
		}

		// Same decode + libx264 encode as the converter, so the same caps.
		const verdict = checkFileSize(f.size, deviceClass());

		if (verdict.kind === "rejected") {
			toast.error(overCapMessage(f.name, formatBytes(f.size), verdict.capMB));

			return;
		}

		if (verdict.kind === "warn") {
			toast(
				m.common_large_file_notice({
					name: f.name,
					size: formatBytes(f.size),
					note: m.videocomp_large_note(),
				}),
			);
		}

		dispatch({ type: "openFile", file: f });
	}

	async function handleCompress() {
		if (!file) return;
		const modeVerdict = resolveMode(state, file);

		if (modeVerdict.kind === "invalid") return;
		const { mode } = modeVerdict;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "compressStart" });

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. The guard after
			// loadEngine catches a cancel that lands during the engine load.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));

			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { compressVideo } = await import("#/lib/video/compress.ts");

			const exit = await Effect.runPromiseExit(
				withBusy(
					compressVideo(
						{ file, mode, resolution: state.resolution },
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

				if (CompressOutput.$is("kept")(out)) {
					dispatch({ type: "compressSuccess", output: { kind: "kept" } });
					toast(m.videocomp_kept());

					return;
				}

				dispatch({
					type: "compressSuccess",
					output: {
						kind: "compressed",
						blob: out.blob,
						name: out.name,
						size: out.size,
						overTargetMB:
							out.overTarget && CompressMode.guards.size(mode)
								? mode.targetMB
								: null,
					},
				});
				recordToolUse("/video-compressor");
				toast.success(`${m.videocomp_ready()} ${m.common_output_ready_hint()}`);

				return;
			}

			// TargetTooSmallError goes next to the size field; every other failure
			// (EngineNotLoadedError | VideoCompressError) is a toast.
			Option.match(Cause.findErrorOption(exit.cause), {
				onNone: () => toast.error(m.videocomp_failed()),
				onSome: (error) =>
					Predicate.isTagged(error, "TargetTooSmallError")
						? dispatch({ type: "sizeError", message: error.message })
						: toast.error(error.message),
			});
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error ? err.message : m.videocomp_unexpected(),
			);
		} finally {
			if (!token.cancelled) dispatch({ type: "compressEnd" });
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
			<PageHeader title={m.tool_video_compressor_label()}>{intro()}</PageHeader>

			<HandoffNotice handoff={handoff} />

			{!file ? (
				<Dropzone
					label={m.common_video_dropzone_label()}
					actionLabel={m.common_choose_a_video()}
					hint={m.videocomp_hint()}
					accept="video/*"
					ariaLabel={m.videocomp_dropzone_aria()}
					onFiles={addFiles}
				/>
			) : (
				<CompressPanel
					file={file}
					state={state}
					dispatch={dispatch}
					onCancel={handleCancel}
					onCompress={handleCompress}
				/>
			)}
		</PageShell>
	);
}

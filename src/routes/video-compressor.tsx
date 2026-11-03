import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option, Predicate } from "effect";
import { Minimize2 } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
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
import { withBusy } from "#/lib/offline/busy.ts";
import { seoHead } from "#/lib/seo.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import { CompressMode, CompressOutput } from "#/lib/video/compress-options.ts";
import { checkFileSize } from "#/lib/video/limits.ts";

export const Route = createFileRoute("/video-compressor")({
	head: () => seoHead("/video-compressor"),
	component: VideoCompressorPage,
});

const COMPRESS_CONSENT_DESCRIPTION = (
	<>
		Videos are compressed entirely on your device, but the engine itself is a
		one-time {ENGINE_SIZE_LABEL} download. It is cached after the first load, so
		return visits are instant. Nothing leaves your browser.
	</>
);

const INTRO =
	"Shrink a video to fit an upload limit, entirely in your browser.";

function VideoCompressorPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <CompressShell />;

	return (
		<PageShell>
			<PageHeader title="Compress Video">{INTRO}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={Minimize2}
				consentDescription={COMPRESS_CONSENT_DESCRIPTION}
				disabledTitle="Video compression is disabled"
				enableLabel="Enable video compression"
			/>
		</PageShell>
	);
}

function CompressShell() {
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const [state, dispatch] = useReducer(compressReducer, initialCompressState);
	const { file } = state;

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];

		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(`"${f.name}" is not a video.`);

			return;
		}

		// Same decode + libx264 encode as the converter, so the same caps.
		const verdict = checkFileSize(f.size, deviceClass());

		if (verdict.kind === "rejected") {
			toast.error(
				`"${f.name}" is ${formatBytes(f.size)}, over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB.`,
			);

			return;
		}

		if (verdict.kind === "warn") {
			toast(
				`"${f.name}" is ${formatBytes(f.size)}. Large files use more memory while compressing.`,
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
					toast("Already small, kept the original.");

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
				toast.success("Your video is ready. Hit Save to download it.");

				return;
			}

			// TargetTooSmallError goes next to the size field; every other failure
			// (EngineNotLoadedError | VideoCompressError) is a toast.
			Option.match(Cause.findErrorOption(exit.cause), {
				onNone: () => toast.error("Could not compress the video."),
				onSome: (error) =>
					Predicate.isTagged(error, "TargetTooSmallError")
						? dispatch({ type: "sizeError", message: error.message })
						: toast.error(error.message),
			});
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Compressing the video failed unexpectedly.",
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
			<PageHeader title="Compress Video">{INTRO}</PageHeader>

			{!file ? (
				<Dropzone
					label="Drag & drop a video here, or"
					actionLabel="Choose a video"
					hint="One video file at a time. Saved as MP4."
					accept="video/*"
					ariaLabel="Choose a video to compress"
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

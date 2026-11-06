import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Exit, Option } from "effect";
import { ImagePlay } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { VideoClipStage } from "#/components/video-clip-stage.tsx";
import { deviceClass, formatBytes } from "#/components/video-cutter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { GifPanel } from "#/components/video-gif/gif-panel.tsx";
import { gifReducer, initialGifState } from "#/components/video-gif/state.ts";
import { useClipPlayer } from "#/hooks/use-clip-player.ts";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import { seoHead } from "#/lib/seo.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import {
	fitLongSide,
	initialGifEnd,
	MAX_GIF_SECONDS,
} from "#/lib/video/gif-options.ts";
import { checkFileSize, overCapMessage } from "#/lib/video/limits.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/video-to-gif")({
	head: () => seoHead("/video-to-gif"),
	component: VideoToGifPage,
});

// Functions, not constants: a constant would keep the language it was built in.
const consentDescription = () =>
	`${m.videogif_consent({ size: ENGINE_SIZE_LABEL })} ${m.video_engine_consent_tail()}`;

const intro = () => m.videogif_intro();

function VideoToGifPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <GifShell />;

	return (
		<PageShell width="wide">
			<PageHeader title={m.tool_video_to_gif_label()}>{intro()}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={ImagePlay}
				consentDescription={consentDescription()}
				disabledTitle={m.videogif_disabled()}
				enableLabel={m.videogif_enable()}
			/>
		</PageShell>
	);
}

function GifShell() {
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const player = useClipPlayer({ initialEnd: initialGifEnd });
	const { file, duration, start, end, videoWidth, videoHeight } = player;

	const [state, dispatch] = useReducer(gifReducer, initialGifState);
	const { fps, size, making, cancelling, output } = state;

	const dimensions = fitLongSide(videoWidth, videoHeight, size);
	const clipSeconds = Math.max(0, end - start);

	function addFiles(fileList: FileList | null) {
		const f = fileList?.[0];

		if (!f) return;

		if (!f.type.startsWith("video/")) {
			toast.error(m.common_not_a_video({ name: f.name }));

			return;
		}

		// This tool decodes video like the converter, so it uses the converter caps.
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
					note: m.videogif_large_note(),
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

	async function handleMake() {
		if (!file || !dimensions) return;
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "makeStart" });

		try {
			// Dynamic imports keep @ffmpeg/* out of the route bundle. The guard after
			// loadEngine catches a cancel that lands during the engine load.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));

			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { makeGif } = await import("#/lib/video/gif.ts");

			const exit = await Effect.runPromiseExit(
				withBusy(
					makeGif(
						{
							file,
							startSec: start,
							endSec: end,
							fps,
							width: dimensions.width,
							height: dimensions.height,
						},
						() => token.cancelled,
					),
				),
			);

			if (token.cancelled) return;

			if (Exit.isSuccess(exit)) {
				const out = exit.value;
				dispatch({
					type: "makeSuccess",
					output: { blob: out.blob, name: out.name, size: out.size },
				});
				toast.success(`${m.videogif_ready()} ${m.common_output_ready_hint()}`);
			} else {
				const message = Option.match(Cause.findErrorOption(exit.cause), {
					onNone: () => m.videogif_failed(),
					onSome: (error) => error.message,
				});

				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(err instanceof Error ? err.message : m.videogif_unexpected());
		} finally {
			if (!token.cancelled) dispatch({ type: "makeEnd" });
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

	const canMake =
		duration > 0 &&
		dimensions !== null &&
		clipSeconds > 0 &&
		clipSeconds <= MAX_GIF_SECONDS &&
		!making;

	return (
		<PageShell width="wide">
			<PageHeader title={m.tool_video_to_gif_label()}>{intro()}</PageHeader>

			{!file ? (
				<Dropzone
					label={m.common_video_dropzone_label()}
					actionLabel={m.common_choose_a_video()}
					hint={m.videogif_hint({ seconds: MAX_GIF_SECONDS })}
					accept="video/*"
					ariaLabel={m.videogif_dropzone_aria()}
					onFiles={addFiles}
				/>
			) : (
				<div className="grid items-start gap-4 min-[769px]:grid-cols-[minmax(0,1fr)_22rem]">
					<VideoClipStage
						player={player}
						disabled={making}
						maxSelection={MAX_GIF_SECONDS}
						note={m.videogif_note({ seconds: MAX_GIF_SECONDS })}
					/>

					<GifPanel
						fps={fps}
						size={size}
						dimensions={dimensions}
						clipSeconds={clipSeconds}
						making={making}
						cancelling={cancelling}
						canMake={canMake}
						output={output}
						onChangeFps={(value) => dispatch({ type: "setFps", value })}
						onChangeSize={(value) => dispatch({ type: "setSize", value })}
						onCancel={handleCancel}
						onReset={reset}
						onMake={handleMake}
					/>
				</div>
			)}
		</PageShell>
	);
}

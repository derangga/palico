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
import { checkFileSize } from "#/lib/video/limits.ts";

export const Route = createFileRoute("/video-to-gif")({
	head: () => seoHead("/video-to-gif"),
	component: VideoToGifPage,
});

const GIF_CONSENT_DESCRIPTION = (
	<>
		GIFs are made entirely on your device, but the engine itself is a one-time{" "}
		{ENGINE_SIZE_LABEL} download. It is cached after the first load, so return
		visits are instant. Nothing leaves your browser.
	</>
);

const INTRO =
	"Turn a short clip of any video into an animated GIF, entirely in your browser.";

function VideoToGifPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") return <GifShell />;

	return (
		<PageShell>
			<PageHeader title="Video to GIF">{INTRO}</PageHeader>
			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={ImagePlay}
				consentDescription={GIF_CONSENT_DESCRIPTION}
				disabledTitle="GIF making is disabled"
				enableLabel="Enable GIF making"
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
			toast.error(`"${f.name}" is not a video.`);

			return;
		}

		// This tool decodes video like the converter, so it uses the converter caps.
		const verdict = checkFileSize(f.size, deviceClass());

		if (verdict.kind === "rejected") {
			toast.error(
				`"${f.name}" is ${formatBytes(f.size)}, over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB.`,
			);

			return;
		}

		if (verdict.kind === "warn") {
			toast(
				`"${f.name}" is ${formatBytes(f.size)}. Large files use more memory while making the GIF.`,
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
				toast.success("Your GIF is ready. Hit Save to download it.");
			} else {
				const message = Option.match(Cause.findErrorOption(exit.cause), {
					onNone: () => "Could not make the GIF.",
					onSome: (error) => error.message,
				});

				toast.error(message);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Making the GIF failed unexpectedly.",
			);
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
		<PageShell className="min-[769px]:max-w-6xl">
			<PageHeader title="Video to GIF">{INTRO}</PageHeader>

			{!file ? (
				<Dropzone
					label="Drag & drop a video here, or"
					actionLabel="Choose a video"
					hint={`One video file at a time. GIFs can be up to ${MAX_GIF_SECONDS} seconds long.`}
					accept="video/*"
					ariaLabel="Choose a video to turn into a GIF"
					onFiles={addFiles}
				/>
			) : (
				<div className="grid items-start gap-4 min-[769px]:grid-cols-[minmax(0,1fr)_22rem]">
					<VideoClipStage
						player={player}
						disabled={making}
						maxSelection={MAX_GIF_SECONDS}
						note={`Pick up to ${MAX_GIF_SECONDS} seconds. Shorter clips make smaller GIFs.`}
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

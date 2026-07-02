import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Film } from "lucide-react";
import { useId, useReducer, useRef } from "react";
import { toast } from "sonner";

import { CancelDialog } from "#/components/video-converter/cancel-dialog.tsx";
import { ConverterControls } from "#/components/video-converter/converter-controls.tsx";
import { Dropzone } from "#/components/video-converter/dropzone.tsx";
import { FileRow } from "#/components/video-converter/file-row.tsx";
import { ProcessTimeDialog } from "#/components/video-converter/process-time-dialog.tsx";
import {
	converterReducer,
	initialConverterState,
} from "#/components/video-converter/state.ts";
import type { Item } from "#/components/video-converter/types.ts";
import {
	deviceClass,
	formatBytes,
} from "#/components/video-converter/utils.ts";
import { VideoEnginePanel } from "#/components/video-engine-panel.tsx";
import { useEngineGate } from "#/hooks/use-engine-gate.ts";
import { ENGINE_SIZE_LABEL } from "#/lib/video/cache.ts";
import {
	checkFileSize,
	MAX_FILES,
	processTimeWarningLevel,
} from "#/lib/video/limits.ts";
import {
	getSuppressSmallWarning,
	setSuppressSmallWarning,
} from "#/lib/video/preferences.ts";
import { VIDEO_OUTPUT_FORMATS } from "#/lib/video/types.ts";

export const Route = createFileRoute("/video-converter")({
	component: VideoConverterPage,
});

// Static consent copy — hoisted to module scope so it isn't rebuilt each render
// and doesn't force VideoEnginePanel to redraw.
const CONVERTER_CONSENT_DESCRIPTION = (
	<>
		Video conversion runs entirely on your device, but the engine itself is a
		one-time {ENGINE_SIZE_LABEL} download. It is cached after the first load, so
		return visits are instant. Nothing leaves your browser.
	</>
);

function VideoConverterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") {
		return <ConverterShell />;
	}

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Converter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert videos to MP4, WebM, MOV, MKV, or AVI, entirely in your
					browser.
				</p>
			</div>

			<VideoEnginePanel
				phase={gate.phase}
				declined={gate.declined}
				onStart={gate.startLoad}
				onDecline={gate.decline}
				icon={Film}
				consentDescription={CONVERTER_CONSENT_DESCRIPTION}
				disabledTitle="Video conversion is disabled"
				enableLabel="Enable video conversion"
			/>
		</div>
	);
}

function ConverterShell() {
	const inputId = useId();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const cancelTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
	const [state, dispatch] = useReducer(converterReducer, initialConverterState);
	const {
		items,
		format,
		isRunning,
		batchTotal,
		batchDone,
		pending,
		dontShowAgain,
		confirmCancel,
		cancelling,
	} = state;

	function addFiles(fileList: FileList | null) {
		if (!fileList) return;
		const accepted: Item[] = [];

		const device = deviceClass();

		for (const file of Array.from(fileList)) {
			if (!file.type.startsWith("video/")) {
				toast.error(`"${file.name}" is not a video.`);
				continue;
			}

			const verdict = checkFileSize(file.size, device);
			if (verdict.kind === "rejected") {
				// Rejected files never enter the queue, so conversion never runs
				// on them — no engine work is triggered.
				toast.error(
					`"${file.name}" is ${formatBytes(file.size)} — over the ${verdict.capMB} MB limit. Browser memory caps this tool at ${verdict.capMB} MB; for larger files, please use a desktop video editor.`,
				);
				continue;
			}
			if (verdict.kind === "warn") {
				toast(
					`"${file.name}" is ${formatBytes(file.size)}. This may take several minutes to convert.`,
				);
			}

			accepted.push({
				// Random id: name/size/mtime collide when the same file is added in
				// two separate drops, which breaks React keys and progress routing.
				id: crypto.randomUUID(),
				file,
				status: "ready",
			});
		}

		if (accepted.length > 0) {
			const room = Math.max(MAX_FILES - items.length, 0);
			if (accepted.length > room) {
				toast.error(`You can convert up to ${MAX_FILES} videos at a time.`);
			}
			dispatch({ type: "addItems", items: accepted.slice(0, room) });
		}
	}

	// Decide whether the process-time dialog must gate this conversion, based
	// on the largest queued file:
	//   "always"      → ≥50MB, show regardless of preference
	//   "suppressible" → 20–50MB, show unless the user opted out
	//   "none"         → <20MB, convert immediately
	function handleConvert() {
		const targets = items.filter(
			(i) => i.status === "ready" || i.status === "error",
		);
		if (targets.length === 0) return;

		const largest = Math.max(...targets.map((t) => t.file.size));
		const level = processTimeWarningLevel(largest);

		if (level === "none") {
			void runConversion(targets);
			return;
		}
		if (level === "suppressible") {
			const suppressed = Effect.runSync(getSuppressSmallWarning);
			if (suppressed) {
				void runConversion(targets);
				return;
			}
		}

		dispatch({ type: "openPending", targets });
	}

	function confirmPending() {
		const targets = pending;
		dispatch({ type: "clearPending" });
		if (!targets) return;
		if (dontShowAgain) Effect.runSync(setSuppressSmallWarning(true));
		void runConversion(targets);
	}

	async function runConversion(targets: Item[]) {
		const token = { cancelled: false };
		cancelTokenRef.current = token;
		dispatch({ type: "runStart", total: targets.length });

		const meta = VIDEO_OUTPUT_FORMATS.find((f) => f.value === format);
		const formatLabel = meta?.label ?? format.toUpperCase();
		const inputs = targets.map((item) => ({
			id: item.id,
			file: item.file,
			format,
		}));

		try {
			// Dynamic import keeps @ffmpeg/* out of the route bundle. Engine.ts
			// holds the loaded singleton; converter.ts calls into it.
			// loadEngine is idempotent — a no-op when the engine is already
			// loaded, and a fast cache-backed re-init after a prior cancel
			// terminated the worker.
			// Await-before-guard is intentional: the guard below catches a cancel
			// that lands during the (potentially slow) engine load, so the await
			// must run before it — not after.
			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine(() => {}));
			if (token.cancelled) return;

			// react-doctor-disable-next-line react-doctor/async-defer-await
			const { convertVideos } = await import("#/lib/video/converter.ts");

			const outputs = await Effect.runPromise(
				convertVideos(
					inputs,
					(update) => {
						dispatch({ type: "progressUpdate", update, formatLabel });
						if (update.status === "done" || update.status === "error") {
							dispatch({ type: "batchTick" });
						}
					},
					() => token.cancelled,
				),
			);

			// A cancel that landed while the batch was draining owns the UI
			// reset — don't clobber it with success/failure toasts.
			if (token.cancelled) return;

			const ok = outputs.length;
			const failed = inputs.length - ok;
			if (ok > 0) {
				toast.success(
					`Converted ${ok} video${ok === 1 ? "" : "s"} to ${formatLabel}.`,
				);
			}
			if (failed > 0) {
				toast.error(
					`${failed} video${failed === 1 ? "" : "s"} could not be converted.`,
				);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error
					? err.message
					: "Video conversion failed unexpectedly.",
			);
		} finally {
			if (!token.cancelled) dispatch({ type: "runEnd" });
		}
	}

	// Confirmed cancellation: kill the worker (terminate() rejects the in-flight
	// exec, which the pipeline catches), then reset queued/in-flight rows to
	// "ready" while keeping any already-finished downloads. The next Convert
	// re-inits the engine from cache.
	async function cancelConversion() {
		cancelTokenRef.current.cancelled = true;
		dispatch({ type: "cancelStart" });
		try {
			const { disposeEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(disposeEngine);
		} finally {
			dispatch({ type: "cancelReset" });
		}
	}

	const convertable = items.filter(
		(i) => i.status === "ready" || i.status === "error",
	);

	const convertLabel = isRunning
		? `Converting ${batchDone} / ${batchTotal}`
		: convertable.length <= 1
			? "Convert"
			: `Convert ${convertable.length} files`;

	return (
		<div className="mx-auto w-full max-w-3xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">Video Converter</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Convert videos to MP4, WebM, MOV, MKV, or AVI, entirely in your
					browser. Files convert one at a time to keep memory in check, up to{" "}
					{MAX_FILES} per batch.
				</p>
			</div>

			<Dropzone
				inputId={inputId}
				fileInputRef={fileInputRef}
				isRunning={isRunning}
				onFiles={addFiles}
			/>

			{items.length > 0 && (
				<>
					<ConverterControls
						format={format}
						onChangeFormat={(next) =>
							dispatch({ type: "changeFormat", format: next })
						}
						isRunning={isRunning}
						cancelling={cancelling}
						convertLabel={convertLabel}
						convertDisabled={isRunning || convertable.length === 0}
						onCancelClick={() =>
							dispatch({ type: "setConfirmCancel", value: true })
						}
						onClear={() => dispatch({ type: "reset" })}
						onConvert={handleConvert}
					/>

					<ul className="mt-4 flex flex-col gap-2">
						{items.map((item) => (
							<FileRow
								key={item.id}
								item={item}
								isRunning={isRunning}
								onRemove={() => dispatch({ type: "removeItem", id: item.id })}
							/>
						))}
					</ul>
				</>
			)}

			<ProcessTimeDialog
				pending={pending}
				format={format}
				dontShowAgain={dontShowAgain}
				onDontShowAgainChange={(value) =>
					dispatch({ type: "setDontShowAgain", value })
				}
				onCancel={() => dispatch({ type: "clearPending" })}
				onConfirm={confirmPending}
			/>

			<CancelDialog
				open={confirmCancel}
				onOpenChange={(open) => {
					if (!open) dispatch({ type: "setConfirmCancel", value: false });
				}}
				onConfirm={cancelConversion}
			/>
		</div>
	);
}

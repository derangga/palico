import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { Film } from "lucide-react";
import { useReducer, useRef } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CancelDialog } from "#/components/video-converter/cancel-dialog.tsx";
import { ConverterControls } from "#/components/video-converter/converter-controls.tsx";
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
import { withBusy } from "#/lib/offline/busy.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
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
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/video-converter")({
	head: () => seoHead("/video-converter"),
	component: VideoConverterPage,
});

// Static consent copy — hoisted to module scope so it isn't rebuilt each render
// and doesn't force VideoEnginePanel to redraw.
// A function, not a constant: a constant would keep the language it was built in.
const consentDescription = () =>
	`${m.videoconv_consent({ size: ENGINE_SIZE_LABEL })} ${m.video_engine_consent_tail()}`;

function VideoConverterPage() {
	const gate = useEngineGate();

	if (gate.phase.kind === "ready") {
		return <ConverterShell />;
	}

	return (
		<PageShell>
			<PageHeader title={m.tool_video_converter_label()}>
				{m.videoconv_intro()}
			</PageHeader>

			<VideoEnginePanel
				phase={gate.phase}
				onStart={gate.startLoad}
				icon={Film}
				consentDescription={consentDescription()}
				disabledTitle={m.videoconv_disabled()}
				enableLabel={m.videoconv_enable()}
			/>
		</PageShell>
	);
}

function ConverterShell() {
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
				toast.error(m.common_not_a_video({ name: file.name }));
				continue;
			}

			const verdict = checkFileSize(file.size, device);

			if (verdict.kind === "rejected") {
				// Rejected files never enter the queue, so conversion never runs
				// on them — no engine work is triggered.
				toast.error(
					`${m.common_file_over_limit({
						name: file.name,
						size: formatBytes(file.size),
						limit: verdict.capMB,
					})} ${m.videoconv_over_cap({ cap: verdict.capMB })}`,
				);
				continue;
			}

			if (verdict.kind === "warn") {
				toast(
					m.common_large_file_notice({
						name: file.name,
						size: formatBytes(file.size),
						note: m.videoconv_slow_notice(),
					}),
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
				toast.error(m.videoconv_too_many({ max: MAX_FILES }));
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
				withBusy(
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
				),
			);

			// A cancel that landed while the batch was draining owns the UI
			// reset — don't clobber it with success/failure toasts.
			if (token.cancelled) return;

			const ok = outputs.length;
			const failed = inputs.length - ok;

			if (ok > 0) {
				recordToolUse("/video-converter");
				toast.success(
					ok === 1
						? m.videoconv_success_one({ count: ok, label: formatLabel })
						: m.videoconv_success_other({ count: ok, label: formatLabel }),
				);
			}

			if (failed > 0) {
				toast.error(
					failed === 1
						? m.videoconv_failed_one({ count: failed })
						: m.videoconv_failed_other({ count: failed }),
				);
			}
		} catch (err) {
			if (token.cancelled) return;
			toast.error(
				err instanceof Error ? err.message : m.videoconv_unexpected(),
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
		? m.videoconv_converting({ done: batchDone, total: batchTotal })
		: convertable.length <= 1
			? m.videoconv_convert()
			: m.videoconv_convert_files({ count: convertable.length });

	return (
		<PageShell>
			<PageHeader title={m.tool_video_converter_label()}>
				{m.videoconv_description({ max: MAX_FILES })}
			</PageHeader>

			<Dropzone
				label={m.videoconv_dropzone_label()}
				actionLabel={m.common_choose_files()}
				hint={m.videoconv_hint({ max: MAX_FILES })}
				accept="video/*"
				multiple
				ariaLabel={m.videoconv_dropzone_aria()}
				disabled={isRunning}
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
		</PageShell>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Option, Exit } from "effect";
import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { toast } from "sonner";

import { Dropzone } from "#/components/dropzone.tsx";
import { HandoffNotice } from "#/components/handoff/handoff-notice.tsx";
import { SendTo } from "#/components/handoff/send-to.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { ModeToggle } from "#/components/resizer/mode-toggle.tsx";
import { PercentControls } from "#/components/resizer/percent-controls.tsx";
import { PixelControls } from "#/components/resizer/pixel-controls.tsx";
import { ResultCard } from "#/components/resizer/result-card.tsx";
import { SourceBar } from "#/components/resizer/source-bar.tsx";
import {
	initialResizeState,
	resizeReducer,
	toInt,
} from "#/components/resizer/state.ts";
import { downloadBlob, formatBytes } from "#/components/resizer/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import { useHandoff } from "#/hooks/use-handoff.ts";
import { currentLocale } from "#/lib/i18n/state.ts";
import { resizeImage } from "#/lib/image/resizer.ts";
import {
	MAX_DIMENSION,
	MAX_FILE_BYTES,
	outputFileName,
	sourceFormatMeta,
} from "#/lib/image/types.ts";
import { seoHead } from "#/lib/seo.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/resizer")({
	head: () => seoHead("/resizer"),
	component: ResizerPage,
});

const MB = 1024 * 1024;

function ResizerPage() {
	const abortRef = useRef<AbortController | null>(null);
	const lastEditedRef = useRef<"w" | "h">("w");

	const [state, dispatch] = useReducer(resizeReducer, initialResizeState);
	const { source, mode, pxWidth, pxHeight, pct, status, result } = state;

	// Predicted output dimensions (in px), computed live.
	let outW = 0;
	let outH = 0;

	if (source) {
		if (mode === "percent") {
			outW = Math.max(1, Math.round((source.srcW * pct) / 100));
			outH = Math.max(1, Math.round((source.srcH * pct) / 100));
		} else {
			outW = toInt(pxWidth);
			outH = toInt(pxHeight);
		}
	}

	const enlarges = source != null && (outW > source.srcW || outH > source.srcH);
	const blockedByEnlarge = mode === "pixels" && state.noEnlarge && enlarges;

	const canResize =
		source != null &&
		status !== "processing" &&
		outW >= 1 &&
		outH >= 1 &&
		!blockedByEnlarge;

	const handoff = useHandoff((files) => void selectFile(files), {
		hasFile: source != null,
	});

	const resultName = (file: File) =>
		outputFileName(file.name, sourceFormatMeta(file.type).ext);

	async function selectFile(fileList: FileList | null) {
		const file = fileList?.[0];

		if (!file) return;

		if (!file.type.startsWith("image/")) {
			toast.error(m.common_not_an_image({ name: file.name }));

			return;
		}

		if (file.size > MAX_FILE_BYTES) {
			toast.error(
				m.common_file_over_limit({
					name: file.name,
					size: formatBytes(file.size),
					limit: Math.round(MAX_FILE_BYTES / MB),
				}),
			);

			return;
		}

		let bitmap: ImageBitmap;

		try {
			bitmap = await createImageBitmap(file);
		} catch {
			toast.error(m.resizer_read_failed({ name: file.name }));

			return;
		}

		const srcW = bitmap.width;
		const srcH = bitmap.height;
		bitmap.close();

		if (srcW > MAX_DIMENSION || srcH > MAX_DIMENSION) {
			toast.error(
				m.error_dimensions_named({
					name: file.name,
					width: srcW,
					height: srcH,
					limit: MAX_DIMENSION.toLocaleString(currentLocale()),
				}),
			);

			return;
		}

		lastEditedRef.current = "w";
		dispatch({ type: "fileLoaded", source: { file, srcW, srcH } });
	}

	function reset() {
		dispatch({ type: "reset" });
	}

	function changeWidth(value: string) {
		lastEditedRef.current = "w";
		dispatch({ type: "changeWidth", value });
	}

	function changeHeight(value: string) {
		lastEditedRef.current = "h";
		dispatch({ type: "changeHeight", value });
	}

	function toggleMaintainAR(on: boolean) {
		dispatch({
			type: "toggleMaintainAR",
			on,
			lastEdited: lastEditedRef.current,
		});
	}

	async function handleResize() {
		if (!source || !canResize) return;
		dispatch({ type: "startProcessing" });

		const ac = new AbortController();
		abortRef.current = ac;

		const exit = await Effect.runPromiseExit(
			resizeImage({
				id: crypto.randomUUID(),
				file: source.file,
				targetWidth: outW,
				targetHeight: outH,
			}),
			{ signal: ac.signal },
		);

		abortRef.current = null;

		if (Exit.isSuccess(exit)) {
			dispatch({ type: "succeed", result: exit.value });
			recordToolUse("/resizer");
			toast.success(
				m.resizer_done_toast({
					width: exit.value.width,
					height: exit.value.height,
				}),
			);

			return;
		}

		// Cancellation: acquireUseRelease has already terminated the worker.
		if (Cause.hasInterruptsOnly(exit.cause)) {
			dispatch({ type: "cancel" });

			return;
		}

		// Surface the typed pipeline error message.
		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		const message =
			failure && "message" in failure ? failure.message : m.resizer_failed();

		dispatch({ type: "fail", message });
		toast.error(message);
	}

	function handleCancel() {
		abortRef.current?.abort();
	}

	const previewUrl = useMemo(
		() => (result ? URL.createObjectURL(result.blob) : null),
		[result],
	);

	useEffect(() => {
		return () => {
			if (previewUrl) URL.revokeObjectURL(previewUrl);
		};
	}, [previewUrl]);

	const sourceFormatLabel = source
		? sourceFormatMeta(source.file.type).label
		: "";

	return (
		<PageShell>
			<PageHeader title={m.tool_resizer_label()}>
				{m.resizer_description({
					mb: Math.round(MAX_FILE_BYTES / MB),
					pixels: MAX_DIMENSION.toLocaleString(currentLocale()),
				})}
			</PageHeader>

			<HandoffNotice handoff={handoff} />

			{!source ? (
				<Dropzone
					label={m.resizer_dropzone_label()}
					actionLabel={m.common_choose_file()}
					hint={m.resizer_hint({
						mb: Math.round(MAX_FILE_BYTES / MB),
						pixels: MAX_DIMENSION.toLocaleString(currentLocale()),
					})}
					accept="image/*"
					ariaLabel={m.resizer_dropzone_aria()}
					onFiles={selectFile}
				/>
			) : (
				<>
					<SourceBar
						fileName={source.file.name}
						srcW={source.srcW}
						srcH={source.srcH}
						outW={outW}
						outH={outH}
						formatLabel={sourceFormatLabel}
						onRemove={reset}
					/>

					<ModeToggle
						mode={mode}
						onSetMode={(next) => dispatch({ type: "setMode", mode: next })}
					/>

					{/* Controls */}
					<div className="mt-4 rounded-xl border bg-card p-4">
						{mode === "pixels" ? (
							<PixelControls
								pxWidth={pxWidth}
								pxHeight={pxHeight}
								maintainAR={state.maintainAR}
								noEnlarge={state.noEnlarge}
								onChangeWidth={changeWidth}
								onChangeHeight={changeHeight}
								onToggleAR={toggleMaintainAR}
								onSetNoEnlarge={(value) =>
									dispatch({ type: "setNoEnlarge", value })
								}
							/>
						) : (
							<PercentControls
								pct={pct}
								onChangePct={(value) => dispatch({ type: "changePct", value })}
							/>
						)}

						{blockedByEnlarge && (
							<p className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
								<CircleAlert className="size-4 shrink-0" />
								{m.resizer_blocked({ width: outW, height: outH })}
							</p>
						)}

						<div className="mt-4 flex items-center justify-end gap-2">
							{status === "processing" ? (
								<>
									<p className="mr-auto text-xs text-muted-foreground">
										{m.resizer_large_note()}
									</p>
									<Button variant="ghost" onClick={handleCancel}>
										{m.common_cancel()}
									</Button>
								</>
							) : (
								<Button variant="ghost" onClick={reset}>
									{m.common_clear()}
								</Button>
							)}
							<Button onClick={handleResize} disabled={!canResize}>
								{status === "processing" ? (
									<Loader2 className="animate-spin" />
								) : null}
								{m.resizer_action()}
							</Button>
						</div>
					</div>

					{/* Result */}
					{status === "done" && result && (
						<ResultCard
							result={result}
							previewUrl={previewUrl}
							formatLabel={sourceFormatLabel}
							onSave={() => downloadBlob(result.blob, resultName(source.file))}
							sendTo={
								<SendTo
									from="resizer"
									outputs={[
										{ blob: result.blob, name: resultName(source.file) },
									]}
									size="sm"
								/>
							}
						/>
					)}

					{status === "error" && state.errorMsg && (
						<p className="mt-4 flex items-center gap-1.5 text-sm text-destructive">
							<CircleAlert className="size-4 shrink-0" />
							{state.errorMsg}
						</p>
					)}
				</>
			)}
		</PageShell>
	);
}

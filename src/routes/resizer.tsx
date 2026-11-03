import { createFileRoute } from "@tanstack/react-router";
import { Cause, Effect, Option } from "effect";
import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { toast } from "sonner";
import { Dropzone } from "#/components/dropzone.tsx";
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
import { resizeImage } from "#/lib/image/resizer.ts";
import {
	MAX_DIMENSION,
	MAX_FILE_BYTES,
	outputFileName,
	sourceFormatMeta,
} from "#/lib/image/types.ts";

export const Route = createFileRoute("/resizer")({ component: ResizerPage });

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

	async function selectFile(fileList: FileList | null) {
		const file = fileList?.[0];
		if (!file) return;
		if (!file.type.startsWith("image/")) {
			toast.error(`"${file.name}" is not an image.`);
			return;
		}
		if (file.size > MAX_FILE_BYTES) {
			toast.error(
				`"${file.name}" is ${formatBytes(file.size)}, over the ${Math.round(
					MAX_FILE_BYTES / MB,
				)} MB limit.`,
			);
			return;
		}
		let bitmap: ImageBitmap;
		try {
			bitmap = await createImageBitmap(file);
		} catch {
			toast.error(`Could not read "${file.name}".`);
			return;
		}
		const srcW = bitmap.width;
		const srcH = bitmap.height;
		bitmap.close();
		if (srcW > MAX_DIMENSION || srcH > MAX_DIMENSION) {
			toast.error(
				`"${file.name}" is ${srcW}×${srcH}px, over the ${MAX_DIMENSION.toLocaleString()}px limit.`,
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

		if (exit._tag === "Success") {
			dispatch({ type: "succeed", result: exit.value });
			toast.success(`Resized to ${exit.value.width}×${exit.value.height}px.`);
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
			failure && "message" in failure
				? failure.message
				: "Could not resize this image.";
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
			<PageHeader title="Image Resizer">
				Resize an image by pixels or percentage, entirely in your browser. Keeps
				the source format. Up to {Math.round(MAX_FILE_BYTES / MB)} MB and{" "}
				{MAX_DIMENSION.toLocaleString()}px max.
			</PageHeader>

			{!source ? (
				<Dropzone
					label="Drag & drop an image here, or"
					actionLabel="Choose a file"
					hint={`Images up to ${Math.round(MAX_FILE_BYTES / MB)} MB, ${MAX_DIMENSION.toLocaleString()}px max`}
					accept="image/*"
					ariaLabel="Choose an image to resize"
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
								Target {outW}×{outH}px is larger than the source. Uncheck “Do
								not enlarge” or choose a smaller size.
							</p>
						)}

						<div className="mt-4 flex items-center justify-end gap-2">
							{status === "processing" ? (
								<>
									<p className="mr-auto text-xs text-muted-foreground">
										Large images can take a few seconds…
									</p>
									<Button variant="ghost" onClick={handleCancel}>
										Cancel
									</Button>
								</>
							) : (
								<Button variant="ghost" onClick={reset}>
									Clear
								</Button>
							)}
							<Button onClick={handleResize} disabled={!canResize}>
								{status === "processing" ? (
									<Loader2 className="animate-spin" />
								) : null}
								Resize
							</Button>
						</div>
					</div>

					{/* Result */}
					{status === "done" && result && (
						<ResultCard
							result={result}
							previewUrl={previewUrl}
							formatLabel={sourceFormatLabel}
							onSave={() => {
								const meta = sourceFormatMeta(source.file.type);
								downloadBlob(
									result.blob,
									outputFileName(source.file.name, meta.ext),
								);
							}}
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

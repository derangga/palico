import { Cause, Effect, Exit, Option } from "effect";
import { Camera } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CameraPanel } from "#/components/qr/camera-panel.tsx";
import {
	ReadingResult,
	type ResultSource,
	type ResultView,
} from "#/components/qr/reading-result.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useQrCamera } from "#/hooks/use-qr-camera.ts";
import type { QrReading } from "#/lib/qr/decode.ts";
import { readQrFromFile } from "#/lib/qr/worker-client.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

interface ReaderState {
	readonly view: ResultView;
	readonly source: ResultSource;
}

export function QrReader() {
	// Null while the page waits for an image; otherwise the result being shown.
	const [state, setState] = useState<ReaderState | null>(null);
	// Only the newest read may write its result. Dropping a second image while
	// the first is still decoding must not let the first overwrite it.
	const latestRead = useRef(0);
	// Aborting interrupts the read, which ends its worker. Without it a replaced
	// or abandoned read keeps decoding for seconds.
	const reading = useRef<AbortController | null>(null);
	const idleRef = useRef<HTMLElement>(null);
	// Set when the page returns to waiting, so focus follows the person there.
	const refocusIdle = useRef(false);
	const camera = useQrCamera();

	function cancelRead() {
		latestRead.current++;
		reading.current?.abort();
		reading.current = null;
	}

	async function readFile(file: File | undefined) {
		if (!file) return;

		cancelRead();

		const id = latestRead.current;

		camera.stop();

		if (!file.type.startsWith("image/")) {
			setState({
				view: {
					phase: "failed",
					message: m.qrread_not_image({ name: file.name }),
				},
				source: { kind: "other", name: file.name },
			});

			return;
		}

		const source: ResultSource = { kind: "image", file };
		const controller = new AbortController();

		reading.current = controller;
		setState({ view: { phase: "reading" }, source });

		const exit = await Effect.runPromiseExit(readQrFromFile(file), {
			signal: controller.signal,
		});

		if (id !== latestRead.current) return;

		reading.current = null;

		if (Exit.isSuccess(exit)) {
			setState({ view: { phase: "found", reading: exit.value }, source });
			recordToolUse("/qr-reader");

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (!failure) console.error(Cause.pretty(exit.cause));

		setState({
			view: {
				phase: "failed",
				message: failure?.message ?? m.qrread_failed(),
			},
			source,
		});
	}

	function onCameraReading(result: QrReading) {
		cancelRead();
		setState({
			view: { phase: "found", reading: result },
			source: { kind: "camera" },
		});
		recordToolUse("/qr-reader");
	}

	function startCamera() {
		cancelRead();
		setState(null);
		void camera.start(onCameraReading);
	}

	function stopCamera() {
		refocusIdle.current = true;
		camera.stop();
	}

	function reset() {
		cancelRead();
		refocusIdle.current = true;
		camera.stop();
		setState(null);
	}

	// Paste a screenshot anywhere on the page. An effect event always sees the
	// latest handler, so the listener is added once instead of on every render.
	const readPasted = useEffectEvent((file: File) => {
		void readFile(file);
	});

	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
				file.type.startsWith("image/"),
			);

			if (!image) return;

			event.preventDefault();
			readPasted(image);
		};

		document.addEventListener("paste", onPaste);

		return () => document.removeEventListener("paste", onPaste);
	}, []);

	// Leaving the page ends any read still in flight.
	useEffect(
		() => () => {
			reading.current?.abort();
		},
		[],
	);

	// Back to waiting: move focus to the picker so the next step is one key away.
	useEffect(() => {
		if (refocusIdle.current && !state && camera.status === "idle") {
			refocusIdle.current = false;
			idleRef.current?.focus();
		}
	});

	return (
		<PageShell>
			<PageHeader title={m.tool_qr_reader_label()}>
				{m.qrread_description()}
			</PageHeader>

			<div className="flex flex-col gap-4">
				{camera.status !== "idle" && (
					<CameraPanel
						videoRef={camera.videoRef}
						status={camera.status}
						message={camera.message}
						onStop={stopCamera}
						onRetry={startCamera}
						onChooseImage={stopCamera}
					/>
				)}

				{camera.status === "idle" && state && (
					<ReadingResult
						view={state.view}
						source={state.source}
						onReset={reset}
					/>
				)}

				{camera.status === "idle" && !state && (
					<section
						ref={idleRef}
						tabIndex={-1}
						aria-label={m.qrread_choose_aria()}
						className="flex flex-col gap-4 outline-none"
					>
						<Dropzone
							label={m.qrread_dropzone_label()}
							actionLabel={m.common_choose_image()}
							hint={m.qrread_hint()}
							accept="image/*"
							ariaLabel={m.qrread_dropzone_aria()}
							onFiles={(files) => void readFile(files?.[0])}
						/>
						<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-muted-foreground">
								{m.qrread_paste()}
							</p>
							<Button variant="outline" onClick={startCamera}>
								<Camera />
								{m.qrread_scan_camera()}
							</Button>
						</div>
					</section>
				)}
			</div>
		</PageShell>
	);
}

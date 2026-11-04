import { Cause, Effect, Exit, Option } from "effect";
import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Dropzone } from "#/components/dropzone.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { CameraPanel } from "#/components/qr/camera-panel.tsx";
import {
	ReadingResult,
	type ResultView,
} from "#/components/qr/reading-result.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useQrCamera } from "#/hooks/use-qr-camera.ts";
import type { QrReading } from "#/lib/qr/decode.ts";
import { readQrFromFile } from "#/lib/qr/worker-client.ts";

interface ReaderState {
	readonly view: ResultView | null;
	/** The image behind the result. Absent for a camera scan. */
	readonly file?: File;
}

const IDLE: ReaderState = { view: null };

export function QrReader() {
	const [state, setState] = useState<ReaderState>(IDLE);
	// Only the newest read may write its result. Dropping a second image while
	// the first is still decoding must not let the first overwrite it.
	const latestRead = useRef(0);
	const camera = useQrCamera();
	const cameraActive = camera.status !== "idle";

	async function readFile(file: File | undefined) {
		if (!file) return;

		const id = ++latestRead.current;

		if (!file.type.startsWith("image/")) {
			setState({
				view: {
					phase: "failed",
					message: `"${file.name}" isn't an image. Choose a PNG, JPG or WebP file.`,
				},
			});

			return;
		}

		camera.stop();
		setState({ view: { phase: "reading" }, file });

		const exit = await Effect.runPromiseExit(readQrFromFile(file));

		if (id !== latestRead.current) return;

		if (Exit.isSuccess(exit)) {
			setState({ view: { phase: "found", reading: exit.value }, file });

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (!failure) console.error(Cause.pretty(exit.cause));

		setState({
			view: {
				phase: "failed",
				message:
					failure?.message ?? "Something went wrong while reading this image.",
			},
			file,
		});
	}

	function onCameraReading(reading: QrReading) {
		latestRead.current++;
		setState({ view: { phase: "found", reading } });
	}

	function startCamera() {
		latestRead.current++;
		setState(IDLE);
		void camera.start(onCameraReading);
	}

	function reset() {
		latestRead.current++;
		camera.stop();
		setState(IDLE);
	}

	// Paste a screenshot anywhere on the page.
	useEffect(() => {
		const onPaste = (event: ClipboardEvent) => {
			const image = Array.from(event.clipboardData?.files ?? []).find((file) =>
				file.type.startsWith("image/"),
			);

			if (!image) return;

			event.preventDefault();
			void readFile(image);
		};

		document.addEventListener("paste", onPaste);

		return () => document.removeEventListener("paste", onPaste);
	});

	return (
		<PageShell>
			<PageHeader title="QR Code Reader">
				Drop in a photo or screenshot of a QR code to see what is inside, or
				scan one with your camera. Everything is read on your device.
			</PageHeader>

			<div className="flex flex-col gap-4">
				{camera.status !== "idle" && (
					<CameraPanel
						videoRef={camera.videoRef}
						status={camera.status}
						message={camera.message}
						onStop={camera.stop}
						onRetry={startCamera}
						onChooseImage={camera.stop}
					/>
				)}

				{!cameraActive && state.view && (
					<ReadingResult view={state.view} file={state.file} onReset={reset} />
				)}

				{!cameraActive && !state.view && (
					<>
						<Dropzone
							label="Drag & drop a QR code image here, or"
							actionLabel="Choose image"
							hint="PNG, JPG, WebP or GIF, up to 25 MB"
							accept="image/*"
							ariaLabel="Choose an image that contains a QR code"
							onFiles={(files) => void readFile(files?.[0])}
						/>
						<div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
							<p className="text-xs text-muted-foreground">
								You can also paste a screenshot with Ctrl+V or ⌘+V.
							</p>
							<Button variant="outline" onClick={startCamera}>
								<Camera />
								Scan with camera
							</Button>
						</div>
					</>
				)}
			</div>
		</PageShell>
	);
}

import { Cause, Effect, Exit, Option } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { openCamera } from "#/lib/qr/camera.ts";
import type { QrReading } from "#/lib/qr/decode.ts";
import { openFrameReader } from "#/lib/qr/worker-client.ts";

export type CameraStatus = "idle" | "starting" | "scanning" | "error";

// Wide enough to resolve a small code, narrow enough that the worker keeps up.
const FRAME_WIDTH = 960;
const FRAME_GAP_MS = 120;

interface Session {
	readonly stop: () => void;
}

/**
 * Drives the camera scanner. `start` opens the rear camera into the <video>
 * behind `videoRef`, sends a frame to the decode worker about eight times a
 * second and calls `onReading` once with the first code it reads, then
 * releases the camera. The camera also stops when the tab is hidden and when
 * the page unmounts, so the camera light never stays on.
 */
export function useQrCamera() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const sessionRef = useRef<Session | null>(null);
	// Bumped on every start and stop, so a start that is still awaiting the
	// camera can tell it was cancelled.
	const generationRef = useRef(0);
	const [status, setStatus] = useState<CameraStatus>("idle");
	const [message, setMessage] = useState<string | null>(null);

	const release = useCallback(() => {
		generationRef.current++;
		sessionRef.current?.stop();
		sessionRef.current = null;
	}, []);

	const stop = useCallback(() => {
		release();
		setStatus("idle");
		setMessage(null);
	}, [release]);

	const fail = useCallback(
		(text: string) => {
			release();
			setMessage(text);
			setStatus("error");
		},
		[release],
	);

	const start = useCallback(
		async (onReading: (reading: QrReading) => void) => {
			release();

			const generation = generationRef.current;

			setStatus("starting");
			setMessage(null);

			const opened = await Effect.runPromiseExit(
				Effect.gen(function* () {
					const camera = yield* openCamera();
					const frameReader = yield* openFrameReader().pipe(
						// The camera is already on; do not leave it running without a reader.
						Effect.tapError(() =>
							Effect.sync(() => {
								for (const track of camera.getTracks()) track.stop();
							}),
						),
					);

					return { camera, frameReader };
				}),
			);

			if (Exit.isFailure(opened)) {
				const error = Option.getOrUndefined(
					Cause.findErrorOption(opened.cause),
				);

				if (generation === generationRef.current) {
					fail(error?.message ?? "Couldn't start the camera.");
				}

				return;
			}

			const { camera: stream, frameReader: reader } = opened.value;
			const video = videoRef.current;

			if (generation !== generationRef.current || !video) {
				for (const track of stream.getTracks()) track.stop();

				reader.close();

				return;
			}

			// One object, so the stop function and the frame loop share it.
			const loop: { active: boolean; timer: number | undefined } = {
				active: true,
				timer: undefined,
			};
			const canvas = document.createElement("canvas");
			const context = canvas.getContext("2d", { willReadFrequently: true });

			sessionRef.current = {
				stop: () => {
					loop.active = false;
					window.clearTimeout(loop.timer);
					reader.close();

					for (const track of stream.getTracks()) track.stop();

					video.srcObject = null;
				},
			};

			video.srcObject = stream;

			try {
				await video.play();
			} catch {
				if (generation === generationRef.current) {
					fail(
						"Couldn't show the camera. Try again, or choose an image instead.",
					);
				}

				return;
			}

			if (generation !== generationRef.current) return;

			setStatus("scanning");

			const tick = async () => {
				if (!loop.active) return;

				if (context && video.readyState >= 2 && video.videoWidth > 0) {
					const width = Math.min(FRAME_WIDTH, video.videoWidth);
					const height = Math.round(
						(video.videoHeight / video.videoWidth) * width,
					);

					canvas.width = width;
					canvas.height = height;
					context.drawImage(video, 0, 0, width, height);

					try {
						const reading = await reader.read(
							width,
							height,
							context.getImageData(0, 0, width, height).data,
						);

						if (!loop.active) return;

						if (reading) {
							release();
							setStatus("idle");
							onReading(reading);

							return;
						}
					} catch {
						if (loop.active)
							fail("The QR reader stopped unexpectedly. Try again.");

						return;
					}
				}

				loop.timer = window.setTimeout(tick, FRAME_GAP_MS);
			};

			void tick();
		},
		[fail, release],
	);

	// Camera off when the tab is hidden: nobody is looking, and the light stays on.
	useEffect(() => {
		const onHidden = () => {
			if (document.hidden && sessionRef.current) stop();
		};

		document.addEventListener("visibilitychange", onHidden);

		return () => document.removeEventListener("visibilitychange", onHidden);
	}, [stop]);

	useEffect(() => release, [release]);

	return { videoRef, status, message, start, stop };
}

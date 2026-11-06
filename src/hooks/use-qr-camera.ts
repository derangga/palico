import { Cause, Effect, Exit, Option } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import { openCamera } from "#/lib/qr/camera.ts";
import type { QrReading } from "#/lib/qr/decode.ts";
import { openFrameReader } from "#/lib/qr/worker-client.ts";
import { m } from "#/paraglide/messages.js";

export type CameraStatus = "idle" | "starting" | "scanning" | "error";

// Wide enough to resolve a small code, narrow enough that the worker keeps up.
const FRAME_WIDTH = 960;
const FRAME_GAP_MS = 120;

// Shared by the stop function and the frame loop of one camera session.
interface FrameLoop {
	active: boolean;
	timer: number | undefined;
}

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
	// True from the moment start is called until the camera is released, so the
	// tab-hidden handler also covers a camera that is still opening.
	const busyRef = useRef(false);
	const [status, setStatus] = useState<CameraStatus>("idle");
	const [message, setMessage] = useState<string | null>(null);

	const release = useCallback(() => {
		generationRef.current++;
		busyRef.current = false;
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

			busyRef.current = true;

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
					fail(error?.message ?? m.qrcam_err_start());
				}

				return;
			}

			const { camera: stream, frameReader: reader } = opened.value;
			const video = videoRef.current;

			// The tab was hidden while the camera opened: nobody is looking.
			if (document.hidden && generation === generationRef.current) {
				for (const track of stream.getTracks()) track.stop();

				reader.close();
				stop();

				return;
			}

			if (generation !== generationRef.current || !video) {
				for (const track of stream.getTracks()) track.stop();

				reader.close();

				return;
			}

			// One object, so the stop function and the frame loop share it.
			const loop: FrameLoop = {
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

			// The device was unplugged, or the system or another app took it. Without
			// this the video freezes and the loop keeps resending the same frame.
			for (const track of stream.getTracks()) {
				track.onended = () => {
					if (loop.active) {
						fail(m.qrcam_err_disconnected());
					}
				};
			}

			video.srcObject = stream;

			try {
				await video.play();
			} catch {
				if (generation === generationRef.current) {
					fail(m.qrcam_err_show());
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
						const exit = await Effect.runPromiseExit(
							reader.read(
								width,
								height,
								context.getImageData(0, 0, width, height).data,
							),
						);

						if (!loop.active) return;

						if (Exit.isFailure(exit)) {
							const error = Option.getOrUndefined(
								Cause.findErrorOption(exit.cause),
							);

							fail(error?.message ?? m.qrcam_err_reader());

							return;
						}

						if (exit.value) {
							release();
							setStatus("idle");
							onReading(exit.value);

							return;
						}
					} catch {
						if (loop.active) fail(m.qrcam_err_frame());

						return;
					}
				}

				loop.timer = window.setTimeout(tick, FRAME_GAP_MS);
			};

			void tick();
		},
		[fail, release, stop],
	);

	// Camera off when the tab is hidden: nobody is looking, and the light stays on.
	useEffect(() => {
		const onHidden = () => {
			if (document.hidden && busyRef.current) stop();
		};

		document.addEventListener("visibilitychange", onHidden);

		return () => document.removeEventListener("visibilitychange", onHidden);
	}, [stop]);

	useEffect(() => release, [release]);

	return { videoRef, status, message, start, stop };
}

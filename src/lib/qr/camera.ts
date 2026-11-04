// Opens the rear camera for scanning. Failures become a CameraError whose
// reason the page can explain, instead of a raw DOMException.

import { Effect } from "effect";

import { CameraError } from "./errors.ts";

type Reason = CameraError["reason"];

const MESSAGES: Record<Reason, string> = {
	denied:
		"Camera access is blocked. Allow it in your browser's site settings, then try again.",
	"no-camera": "No camera found on this device.",
	"in-use":
		"The camera is busy. Close any other app that is using it, then try again.",
	unsupported:
		"This browser can't open the camera here. Camera access needs a secure (https) page.",
};

function reasonFor(cause: DOMException | Error): Reason {
	switch (cause.name) {
		case "NotAllowedError":
		case "SecurityError":
			return "denied";
		case "NotFoundError":
		case "DevicesNotFoundError":
		case "OverconstrainedError":
			return "no-camera";
		case "NotReadableError":
		case "TrackStartError":
		case "AbortError":
			return "in-use";
		default:
			return "unsupported";
	}
}

export const openCamera = (): Effect.Effect<MediaStream, CameraError> =>
	Effect.tryPromise({
		try: () => {
			if (!navigator.mediaDevices?.getUserMedia) {
				return Promise.reject(new Error("unsupported"));
			}

			return navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					facingMode: { ideal: "environment" },
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
			});
		},
		catch: (cause) => {
			const reason = cause instanceof Error ? reasonFor(cause) : "unsupported";

			return new CameraError({ reason, message: MESSAGES[reason] });
		},
	});

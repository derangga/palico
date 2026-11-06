// Opens the rear camera for scanning. Failures become a CameraError whose
// reason the page can explain, instead of a raw DOMException.

import { Effect } from "effect";

import { m } from "#/paraglide/messages.js";

import { CameraError } from "./errors.ts";

type Reason = CameraError["reason"];

const message = (reason: Reason): string => {
	switch (reason) {
		case "denied":
			return m.qr_err_camera_denied();
		case "no-camera":
			return m.qr_err_camera_none();
		case "in-use":
			return m.qr_err_camera_busy();
		case "unsupported":
			return m.qr_err_camera_unsupported();
	}
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

			return new CameraError({ reason, message: message(reason) });
		},
	});

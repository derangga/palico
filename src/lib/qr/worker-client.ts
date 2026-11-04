// Main-thread side of the QR decode worker, as Effects with typed errors.

import { Effect } from "effect";

import { FileTooLargeError } from "#/lib/image/errors.ts";
import { MAX_FILE_BYTES } from "#/lib/image/types.ts";

import type { QrReading } from "./decode.ts";
import { QrImageError, QrNotFoundError, QrWorkerError } from "./errors.ts";
import type { QrWorkerRequest, QrWorkerResponse } from "./worker-protocol.ts";

// The `new URL(...)` must stay inline inside `new Worker(...)` so Vite bundles
// the worker. Hoisting it into a variable breaks the production build (see
// docs/image-worker-crashed-debugging.md).
const spawn = () =>
	new Worker(new URL("../../workers/qr-decode.worker.ts", import.meta.url), {
		type: "module",
	});

export type ReadFileError =
	| FileTooLargeError
	| QrImageError
	| QrNotFoundError
	| QrWorkerError;

const toReading = (
	response: QrWorkerResponse & { readonly ok: true },
): QrReading => ({
	text: response.text,
	version: response.version,
	ecc: response.ecc,
});

/** Reads the QR code in an image file. The worker is created per call and always ends. */
export const readQrFromFile = (
	file: File,
): Effect.Effect<QrReading, ReadFileError> =>
	Effect.gen(function* () {
		if (file.size > MAX_FILE_BYTES) {
			return yield* Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`,
				}),
			);
		}

		const buffer = yield* Effect.tryPromise({
			try: () => file.arrayBuffer(),
			catch: () =>
				new QrImageError({
					fileName: file.name,
					message: "Couldn't read this file.",
				}),
		});

		return yield* Effect.acquireUseRelease(
			Effect.sync(spawn),
			(worker) =>
				Effect.callback<QrReading, ReadFileError>((resume) => {
					worker.onmessage = (event: MessageEvent<QrWorkerResponse>) => {
						const response = event.data;

						if (response.ok) {
							resume(Effect.succeed(toReading(response)));
						} else if (response.reason === "not-found") {
							resume(
								Effect.fail(
									new QrNotFoundError({
										message:
											"No QR code found. Try a sharper image, or one where the whole code is in view.",
									}),
								),
							);
						} else {
							resume(
								Effect.fail(
									new QrImageError({
										fileName: file.name,
										message: response.message,
									}),
								),
							);
						}
					};

					worker.onerror = (event) => {
						resume(
							Effect.fail(
								new QrWorkerError({
									message:
										event.message || "The QR reader stopped unexpectedly.",
								}),
							),
						);
					};

					const request: QrWorkerRequest = {
						type: "file",
						id: 0,
						buffer,
						mimeType: file.type,
					};

					worker.postMessage(request, [buffer]);
				}),
			(worker) => Effect.sync(() => worker.terminate()),
		);
	});

/** A worker kept open to read camera frames one after another. */
export interface FrameReader {
	/** Resolves with the reading, or undefined when the frame holds no code. */
	readonly read: (
		width: number,
		height: number,
		pixels: Uint8ClampedArray,
	) => Promise<QrReading | undefined>;
	readonly close: () => void;
}

export const openFrameReader = (): Effect.Effect<FrameReader, QrWorkerError> =>
	Effect.try({
		try: () => {
			const worker = spawn();
			let nextId = 1;
			const pending = new Map<
				number,
				{
					readonly resolve: (reading: QrReading | undefined) => void;
					readonly reject: (error: QrWorkerError) => void;
				}
			>();

			worker.onmessage = (event: MessageEvent<QrWorkerResponse>) => {
				const response = event.data;
				const waiting = pending.get(response.id);

				if (!waiting) return;

				pending.delete(response.id);
				waiting.resolve(response.ok ? toReading(response) : undefined);
			};

			worker.onerror = (event) => {
				const error = new QrWorkerError({
					message: event.message || "The QR reader stopped unexpectedly.",
				});

				for (const waiting of pending.values()) waiting.reject(error);

				pending.clear();
			};

			const reader: FrameReader = {
				read: (width, height, pixels) =>
					new Promise((resolve, reject) => {
						const id = nextId++;
						// SAFETY: the pixels come from canvas getImageData, which allocates a
						// plain ArrayBuffer, never a SharedArrayBuffer.
						const buffer = pixels.buffer as ArrayBuffer;

						pending.set(id, { resolve, reject });
						worker.postMessage({ type: "frame", id, width, height, buffer }, [
							buffer,
						]);
					}),
				close: () => {
					for (const waiting of pending.values()) waiting.resolve(undefined);

					pending.clear();
					worker.terminate();
				},
			};

			return reader;
		},
		catch: () =>
			new QrWorkerError({
				message: "Couldn't start the QR reader in this browser.",
			}),
	});

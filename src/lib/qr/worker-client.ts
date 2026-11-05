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
	/** Succeeds with the reading, or undefined when the frame holds no code. */
	readonly read: (
		width: number,
		height: number,
		pixels: Uint8ClampedArray,
	) => Effect.Effect<QrReading | undefined, QrWorkerError>;
	readonly close: () => void;
}

type Resume = (
	effect: Effect.Effect<QrReading | undefined, QrWorkerError>,
) => void;

export const openFrameReader = (): Effect.Effect<FrameReader, QrWorkerError> =>
	Effect.try({
		try: () => {
			const worker = spawn();
			const pending = new Map<number, Resume>();
			// Once the worker has failed or closed, no later read may wait on it.
			const state: {
				nextId: number;
				failure?: QrWorkerError;
				closed: boolean;
			} = { nextId: 1, closed: false };

			const failAll = (error: QrWorkerError) => {
				state.failure = error;

				for (const resume of pending.values()) resume(Effect.fail(error));

				pending.clear();
			};

			worker.onmessage = (event: MessageEvent<QrWorkerResponse>) => {
				const response = event.data;
				const resume = pending.get(response.id);

				if (!resume) return;

				pending.delete(response.id);

				if (response.ok) {
					resume(Effect.succeed(toReading(response)));
				} else if (response.reason === "not-found") {
					resume(Effect.succeed(undefined));
				} else {
					resume(Effect.fail(new QrWorkerError({ message: response.message })));
				}
			};

			worker.onerror = (event) => {
				failAll(
					new QrWorkerError({
						message: event.message || "The QR reader stopped unexpectedly.",
					}),
				);
			};

			worker.onmessageerror = () => {
				failAll(
					new QrWorkerError({
						message: "The QR reader sent back a bad message.",
					}),
				);
			};

			const reader: FrameReader = {
				read: (width, height, pixels) =>
					Effect.callback<QrReading | undefined, QrWorkerError>((resume) => {
						if (state.failure) {
							resume(Effect.fail(state.failure));

							return;
						}

						if (state.closed) {
							resume(Effect.succeed(undefined));

							return;
						}

						const id = state.nextId++;
						// SAFETY: the pixels come from canvas getImageData, which allocates a
						// plain ArrayBuffer, never a SharedArrayBuffer.
						const buffer = pixels.buffer as ArrayBuffer;

						pending.set(id, resume);
						worker.postMessage({ type: "frame", id, width, height, buffer }, [
							buffer,
						]);

						return Effect.sync(() => {
							pending.delete(id);
						});
					}),
				close: () => {
					state.closed = true;

					for (const resume of pending.values())
						resume(Effect.succeed(undefined));

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

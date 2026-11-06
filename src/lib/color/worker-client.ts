// Main-thread side of the palette worker, as an Effect with typed errors.

import { Effect } from "effect";

import { FileTooLargeError } from "#/lib/image/errors.ts";
import { MAX_FILE_BYTES } from "#/lib/image/types.ts";
import { m } from "#/paraglide/messages.js";

import {
	PaletteEmptyError,
	PaletteImageError,
	PaletteWorkerError,
} from "./errors.ts";
import type { PaletteColor } from "./palette.ts";
import type {
	PaletteWorkerRequest,
	PaletteWorkerResponse,
} from "./worker-protocol.ts";

// The `new URL(...)` must stay inline inside `new Worker(...)` so Vite bundles
// the worker. Hoisting it into a variable breaks the production build (see
// docs/image-worker-crashed-debugging.md).
const spawn = () =>
	new Worker(new URL("../../workers/palette.worker.ts", import.meta.url), {
		type: "module",
	});

export type ReadPaletteError =
	| FileTooLargeError
	| PaletteEmptyError
	| PaletteImageError
	| PaletteWorkerError;

/** Reads the dominant colors of an image file. The worker is created per call and always ends. */
export const readPaletteFromFile = (
	file: File,
): Effect.Effect<ReadonlyArray<PaletteColor>, ReadPaletteError> =>
	Effect.gen(function* () {
		if (file.size > MAX_FILE_BYTES) {
			return yield* Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: m.error_file_too_large({
						name: file.name,
						limit: Math.round(MAX_FILE_BYTES / (1024 * 1024)),
					}),
				}),
			);
		}

		const buffer = yield* Effect.tryPromise({
			try: () => file.arrayBuffer(),
			catch: () =>
				new PaletteImageError({
					fileName: file.name,
					message: m.error_color_read_file(),
				}),
		});

		return yield* Effect.acquireUseRelease(
			Effect.sync(spawn),
			(worker) =>
				Effect.callback<ReadonlyArray<PaletteColor>, ReadPaletteError>(
					(resume) => {
						worker.onmessage = (event: MessageEvent<PaletteWorkerResponse>) => {
							const response = event.data;

							if (response.ok) {
								resume(Effect.succeed(response.colors));
							} else if (response.reason === "empty") {
								resume(
									Effect.fail(
										new PaletteEmptyError({ message: m.error_palette_empty() }),
									),
								);
							} else {
								resume(
									Effect.fail(
										new PaletteImageError({
											fileName: file.name,
											message:
												response.reason === "open"
													? m.error_color_open_image()
													: (response.detail ?? m.error_palette_read_failed()),
										}),
									),
								);
							}
						};

						worker.onerror = (event) => {
							resume(
								Effect.fail(
									new PaletteWorkerError({
										message: event.message || m.error_palette_worker_stopped(),
									}),
								),
							);
						};

						worker.onmessageerror = () => {
							resume(
								Effect.fail(
									new PaletteWorkerError({
										message: m.error_palette_worker_bad_message(),
									}),
								),
							);
						};

						const request: PaletteWorkerRequest = {
							id: 0,
							buffer,
							mimeType: file.type,
						};

						worker.postMessage(request, [buffer]);
					},
				),
			(worker) => Effect.sync(() => worker.terminate()),
		);
	});

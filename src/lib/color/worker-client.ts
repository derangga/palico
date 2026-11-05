// Main-thread side of the palette worker, as an Effect with typed errors.

import { Effect } from "effect";

import { FileTooLargeError } from "#/lib/image/errors.ts";
import { MAX_FILE_BYTES } from "#/lib/image/types.ts";

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
					message: `"${file.name}" is larger than the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`,
				}),
			);
		}

		const buffer = yield* Effect.tryPromise({
			try: () => file.arrayBuffer(),
			catch: () =>
				new PaletteImageError({
					fileName: file.name,
					message: "Couldn't read this file.",
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
										new PaletteEmptyError({ message: response.message }),
									),
								);
							} else {
								resume(
									Effect.fail(
										new PaletteImageError({
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
									new PaletteWorkerError({
										message:
											event.message ||
											"The palette reader stopped unexpectedly.",
									}),
								),
							);
						};

						worker.onmessageerror = () => {
							resume(
								Effect.fail(
									new PaletteWorkerError({
										message: "The palette reader sent back a bad message.",
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

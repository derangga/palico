import { Effect, Schema } from "effect";

import {
	type ConvertError,
	DecodeError,
	DimensionsTooLargeError,
	EncodeError,
	WorkerError,
} from "./errors.ts";
import {
	MAX_DIMENSION,
	type OutputFormat,
	type WorkerResponse,
} from "./types.ts";

const workerUrl = new URL(
	"../../workers/image-converter.worker.ts",
	import.meta.url,
);

export const WorkerOutput = Schema.Struct({
	id: Schema.String,
	blob: Schema.instanceOf(Blob),
	width: Schema.Number,
	height: Schema.Number,
	size: Schema.Number,
});
export type WorkerOutput = Schema.Schema.Type<typeof WorkerOutput>;

// Spin up a one-shot worker, transfer the bytes in, await the single response,
// and guarantee termination via acquireUseRelease (covers success, failure,
// interrupt). Shared by the converter and resizer pipelines; passing
// targetWidth/targetHeight scales the image, omitting them keeps source size.
export const runImageWorker = (params: {
	readonly id: string;
	readonly fileName: string;
	readonly buffer: ArrayBuffer;
	readonly sourceType: string;
	readonly format: OutputFormat;
	readonly mime: string;
	readonly quality: number;
	readonly targetWidth?: number;
	readonly targetHeight?: number;
}): Effect.Effect<WorkerOutput, ConvertError> =>
	Effect.acquireUseRelease(
		Effect.sync(() => new Worker(workerUrl, { type: "module" })),
		(worker) =>
			Effect.async<WorkerOutput, ConvertError>((resume) => {
				worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
					const res = event.data;
					if (res.ok) {
						resume(
							Effect.succeed({
								id: params.id,
								blob: new Blob([res.buffer], { type: params.mime }),
								width: res.width,
								height: res.height,
								size: res.size,
							}),
						);
						return;
					}
					switch (res.reason) {
						case "dimensions":
							resume(
								Effect.fail(
									new DimensionsTooLargeError({
										fileName: params.fileName,
										width: res.width ?? 0,
										height: res.height ?? 0,
										limit: MAX_DIMENSION,
										message: res.message,
									}),
								),
							);
							break;
						case "decode":
							resume(
								Effect.fail(
									new DecodeError({
										fileName: params.fileName,
										message: res.message,
									}),
								),
							);
							break;
						default:
							resume(
								Effect.fail(
									new EncodeError({
										fileName: params.fileName,
										format: params.format,
										message: res.message,
									}),
								),
							);
					}
				};
				worker.onerror = (event) => {
					resume(
						Effect.fail(
							new WorkerError({
								fileName: params.fileName,
								message: event.message || "Image worker crashed.",
							}),
						),
					);
				};
				worker.postMessage(
					{
						id: params.id,
						buffer: params.buffer,
						sourceType: params.sourceType,
						mime: params.mime,
						quality: params.quality,
						maxDimension: MAX_DIMENSION,
						targetWidth: params.targetWidth,
						targetHeight: params.targetHeight,
					},
					[params.buffer],
				);
			}),
		(worker) => Effect.sync(() => worker.terminate()),
	);

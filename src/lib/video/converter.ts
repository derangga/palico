// Video conversion pipeline.
//
// CRITICAL: statically imports @ffmpeg/util. Like engine.ts, this module
// must only be reached via a dynamic import('#/lib/video/converter.ts') so
// the engine stays out of the initial route bundle (palico-rpj contract).

import { fetchFile } from "@ffmpeg/util";
import { Effect, Either, Schema } from "effect";

import { type EngineHandle, getEngine } from "./engine.ts";
import {
  type ConvertVideoError,
  EngineNotLoadedError,
  VideoDecodeError,
  VideoEncodeError,
} from "./errors.ts";
import {
  ENCODER_ARGS,
  formatMeta,
  inputExtension,
  outputFileName,
  VideoOutputFormat,
} from "./types.ts";

// DOM-class schemas for the inputs and outputs the pipeline shuttles around.
// Modeled with Schema so the shape lives next to the rest of the domain even
// though we never round-trip these through `decode` at runtime.
const FileFromSelf = Schema.instanceOf(File);
const BlobFromSelf = Schema.instanceOf(Blob);

export const ConvertVideoInput = Schema.Struct({
  id: Schema.String,
  file: FileFromSelf,
  format: VideoOutputFormat,
});
export type ConvertVideoInput = Schema.Schema.Type<typeof ConvertVideoInput>;

export const ConvertVideoOutput = Schema.Struct({
  id: Schema.String,
  blob: BlobFromSelf,
  size: Schema.Number,
  name: Schema.String,
  format: VideoOutputFormat,
});
export type ConvertVideoOutput = Schema.Schema.Type<typeof ConvertVideoOutput>;

const ProgressProcessing = Schema.Struct({
  id: Schema.String,
  status: Schema.Literal("processing"),
  percent: Schema.Number,
});

const ProgressDone = Schema.Struct({
  id: Schema.String,
  status: Schema.Literal("done"),
  output: ConvertVideoOutput,
});

const ProgressError = Schema.Struct({
  id: Schema.String,
  status: Schema.Literal("error"),
  error: Schema.Union(EngineNotLoadedError, VideoDecodeError, VideoEncodeError),
});

export const VideoProgressUpdate = Schema.Union(
  ProgressProcessing,
  ProgressDone,
  ProgressError,
);
export type VideoProgressUpdate = Schema.Schema.Type<
  typeof VideoProgressUpdate
>;

const emitProgress = (
  onProgress: (update: VideoProgressUpdate) => void,
  update: VideoProgressUpdate,
): Effect.Effect<void> => Effect.sync(() => onProgress(update));

const convertOne = (
  ffmpeg: EngineHandle,
  input: ConvertVideoInput,
  emitPercent: (percent: number) => void,
): Effect.Effect<ConvertVideoOutput, VideoDecodeError | VideoEncodeError> =>
  Effect.gen(function* () {
    const meta = formatMeta(input.format);
    const inputName = `input.${inputExtension(input.file)}`;
    const outputName = `output.${meta.ext}`;

    const bytes = yield* Effect.tryPromise({
      try: () => fetchFile(input.file),
      catch: (cause) =>
        new VideoDecodeError({
          fileName: input.file.name,
          message:
            cause instanceof Error
              ? cause.message
              : "Could not read file bytes.",
        }),
    });

    yield* Effect.tryPromise({
      try: () => ffmpeg.writeFile(inputName, bytes),
      catch: (cause) =>
        new VideoEncodeError({
          fileName: input.file.name,
          format: input.format,
          message:
            cause instanceof Error ? cause.message : "Could not stage input.",
        }),
    });

    // Subscribe to ffmpeg's progress event for the duration of this exec.
    // acquireUseRelease guarantees the listener is removed even on failure,
    // so events from a later file's exec can't bleed into this row's bar.
    const exitCode = yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        const handler = ({ progress }: { progress: number }) =>
          emitPercent(Math.max(0, Math.min(100, Math.round(progress * 100))));
        ffmpeg.on("progress", handler);
        return handler;
      }),
      () =>
        Effect.tryPromise({
          try: () =>
            ffmpeg.exec([
              "-i",
              inputName,
              ...ENCODER_ARGS[input.format],
              outputName,
            ]),
          catch: (cause) =>
            new VideoEncodeError({
              fileName: input.file.name,
              format: input.format,
              message:
                cause instanceof Error ? cause.message : "Encoder threw.",
            }),
        }),
      (handler) => Effect.sync(() => ffmpeg.off("progress", handler)),
    );

    if (exitCode !== 0) {
      return yield* new VideoEncodeError({
        fileName: input.file.name,
        format: input.format,
        message: `Encoder exited with code ${exitCode}.`,
      });
    }

    const data = yield* Effect.tryPromise({
      try: () => ffmpeg.readFile(outputName),
      catch: (cause) =>
        new VideoEncodeError({
          fileName: input.file.name,
          format: input.format,
          message:
            cause instanceof Error ? cause.message : "Could not read output.",
        }),
    });

    // ffmpeg.readFile is typed `Uint8Array | string`; only the binary path
    // is valid for binary outputs. Surface the string variant as a typed
    // failure rather than coercing it.
    if (typeof data === "string") {
      return yield* new VideoEncodeError({
        fileName: input.file.name,
        format: input.format,
        message: "ffmpeg returned a string payload instead of binary data.",
      });
    }

    // Best-effort virtual-FS cleanup; failures here don't fail the conversion.
    yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => ffmpeg.deleteFile(inputName),
          catch: () => "delete-failed" as const,
        }).pipe(Effect.ignore),
        Effect.tryPromise({
          try: () => ffmpeg.deleteFile(outputName),
          catch: () => "delete-failed" as const,
        }).pipe(Effect.ignore),
      ],
      { concurrency: "unbounded" },
    );

    const blob = new Blob([data as unknown as BlobPart], { type: meta.mime });
    return {
      id: input.id,
      blob,
      size: blob.size,
      name: outputFileName(input.file.name, meta.ext),
      format: input.format,
    };
  });

// Sequential per-file. ffmpeg.wasm is a single shared instance with one set
// of virtual files and one progress channel — parallel encodes would either
// OOM the browser tab or interleave progress events.
//
// The Effect fails with EngineNotLoadedError when the singleton hasn't been
// initialized; per-file decode/encode failures are caught with Effect.either
// so one bad input never aborts the batch.
export const convertVideos = (
  inputs: ReadonlyArray<ConvertVideoInput>,
  onProgress: (update: VideoProgressUpdate) => void,
): Effect.Effect<ReadonlyArray<ConvertVideoOutput>, EngineNotLoadedError> =>
  Effect.gen(function* () {
    const ffmpeg = yield* getEngine;

    const results = yield* Effect.forEach(
      inputs,
      (input) =>
        Effect.gen(function* () {
          yield* emitProgress(onProgress, {
            id: input.id,
            status: "processing",
            percent: 0,
          });
          const outcome = yield* Effect.either(
            convertOne(ffmpeg, input, (percent) =>
              onProgress({
                id: input.id,
                status: "processing",
                percent,
              }),
            ),
          );
          if (Either.isRight(outcome)) {
            yield* emitProgress(onProgress, {
              id: input.id,
              status: "done",
              output: outcome.right,
            });
          } else {
            yield* emitProgress(onProgress, {
              id: input.id,
              status: "error",
              error: outcome.left,
            });
          }
          return outcome;
        }),
      { concurrency: 1 },
    );

    return results.flatMap((r) => (Either.isRight(r) ? [r.right] : []));
  });

// Re-exported for the route's catch path, which renders `ConvertVideoError`
// instances coming back from per-row Effect.either outcomes.
export type { ConvertVideoError };

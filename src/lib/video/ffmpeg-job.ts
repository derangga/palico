// Shared ffmpeg exec pipeline for the converter and cutter.
//
// CRITICAL: statically imports @ffmpeg/util (and engine.ts, which imports
// @ffmpeg/ffmpeg). Like engine.ts, this module must only be reached via a
// dynamic import so the engine stays out of the initial route bundle
// (palico-rpj contract).
//
// One job = read source bytes → stage into the virtual FS → exec with the
// last 64 stderr lines captured → read the output → best-effort cleanup.
// A non-zero exit surfaces the log tail as the real reason; an emscripten
// OOM/abort additionally disposes the bricked wasm singleton so the next run
// re-inits a fresh worker instead of the tool staying dead until a reload.

import { fetchFile } from "@ffmpeg/util";
import { Effect } from "effect";

import { disposeEngine, type EngineHandle } from "./engine.ts";

export interface FfmpegJobOptions<ER, EJ> {
	readonly ffmpeg: EngineHandle;
	readonly file: File;
	readonly inputName: string;
	readonly outputName: string;
	// Full exec argv, including inputName/outputName.
	readonly args: ReadonlyArray<string>;
	readonly outputMime: string;
	// "Encoder" / "Trim" — names the failing stage in exec error messages.
	readonly label: string;
	// User-facing message when the wasm instance aborts with OOM.
	readonly oomMessage: string;
	// Failure reading the source file's bytes (before any engine work).
	readonly readError: (message: string) => ER;
	// Everything after the bytes were read: stage/exec/output failures.
	readonly jobError: (message: string) => EJ;
	// Attach a progress listener only when provided — stream copy emits none.
	readonly onPercent?: (percent: number) => void;
}

export const runFfmpegJob = <ER, EJ>(
	opts: FfmpegJobOptions<ER, EJ>,
): Effect.Effect<Blob, ER | EJ> =>
	Effect.gen(function* () {
		const { ffmpeg } = opts;

		const bytes = yield* Effect.tryPromise({
			try: () => fetchFile(opts.file),
			catch: (cause) =>
				opts.readError(
					cause instanceof Error ? cause.message : "Could not read file bytes.",
				),
		});

		yield* Effect.tryPromise({
			try: () => ffmpeg.writeFile(opts.inputName, bytes),
			catch: (cause) =>
				opts.jobError(
					cause instanceof Error ? cause.message : "Could not stage input.",
				),
		});

		// Capture ffmpeg's stderr for the duration of this exec. exitCode -1 (the
		// core's default) means it aborted before a clean exit; the bare code is
		// useless on its own, so we keep the tail of the log to surface the real
		// reason (unknown encoder, demux failure, OOM, …) on the error channel.
		const logLines: string[] = [];

		// Subscribe to ffmpeg's log (and optionally progress) events for the
		// duration of this exec. acquireUseRelease guarantees the listeners are
		// removed even on failure, so events from a later exec can't bleed into
		// this job's caller.
		const exitCode = yield* Effect.acquireUseRelease(
			Effect.sync(() => {
				const emitPercent = opts.onPercent;
				const onProgress = emitPercent
					? ({ progress }: { progress: number }) =>
							emitPercent(
								Math.max(0, Math.min(100, Math.round(progress * 100))),
							)
					: undefined;
				const onLog = ({ message }: { type: string; message: string }) => {
					logLines.push(message);
					if (logLines.length > 64) logLines.shift();
				};
				if (onProgress) ffmpeg.on("progress", onProgress);
				ffmpeg.on("log", onLog);
				return { onProgress, onLog };
			}),
			() =>
				Effect.tryPromise({
					try: () => ffmpeg.exec([...opts.args]),
					catch: (cause) =>
						opts.jobError(
							cause instanceof Error ? cause.message : `${opts.label} threw.`,
						),
				}),
			({ onProgress, onLog }) =>
				Effect.sync(() => {
					if (onProgress) ffmpeg.off("progress", onProgress);
					ffmpeg.off("log", onLog);
				}),
		);

		if (exitCode !== 0) {
			// An emscripten OOM/abort leaves the wasm instance permanently
			// unusable. Dispose the singleton so the next run re-inits a fresh
			// worker, and surface an honest, actionable message instead of the raw
			// log.
			const oom = /aborted\(|out of memory|\boom\b/i.test(logLines.join("\n"));
			if (oom) {
				yield* disposeEngine;
				return yield* Effect.fail(opts.jobError(opts.oomMessage));
			}

			const tail = logLines.slice(-8).join(" / ").trim();
			return yield* Effect.fail(
				opts.jobError(
					tail
						? `${opts.label} exited with code ${exitCode}. ${tail}`
						: `${opts.label} exited with code ${exitCode}.`,
				),
			);
		}

		const data = yield* Effect.tryPromise({
			try: () => ffmpeg.readFile(opts.outputName),
			catch: (cause) =>
				opts.jobError(
					cause instanceof Error ? cause.message : "Could not read output.",
				),
		});

		// ffmpeg.readFile is typed `Uint8Array | string`; only the binary path
		// is valid for binary outputs. Surface the string variant as a typed
		// failure rather than coercing it.
		if (typeof data === "string") {
			return yield* Effect.fail(
				opts.jobError(
					"ffmpeg returned a string payload instead of binary data.",
				),
			);
		}

		// Best-effort virtual-FS cleanup; failures here don't fail the job.
		yield* Effect.all(
			[
				Effect.tryPromise({
					try: () => ffmpeg.deleteFile(opts.inputName),
					catch: () => "delete-failed" as const,
				}).pipe(Effect.ignore),
				Effect.tryPromise({
					try: () => ffmpeg.deleteFile(opts.outputName),
					catch: () => "delete-failed" as const,
				}).pipe(Effect.ignore),
			],
			{ concurrency: "unbounded" },
		);

		return new Blob([data as unknown as BlobPart], { type: opts.outputMime });
	});

// Shared ffprobe step for jobs that read a file's details before encoding.
//
// CRITICAL: statically imports engine.ts (and through it @ffmpeg/*). Reach this
// module only through the dynamic-import pipelines (extract-audio.ts,
// compress.ts) so the engine stays out of the route bundle.

import { Effect } from "effect";

import { disposeEngine, type EngineHandle } from "./engine.ts";

const PROBE_FILE = "probe.json";

// Runs ffprobe with `args` (without `-o`), writing probe.json, and returns its
// text. A thrown ffprobe means the wasm instance died, so it is disposed like a
// thrown exec in runFfmpegJob. probe.json is deleted on every exit path.
export const readProbeJson = <E>(opts: {
	readonly ffmpeg: EngineHandle;
	readonly args: ReadonlyArray<string>;
	// Message when ffprobe gives no usable output.
	readonly unreadable: string;
	readonly error: (message: string) => E;
}): Effect.Effect<string, E> => {
	const { ffmpeg } = opts;
	return Effect.gen(function* () {
		const result = yield* Effect.promise(
			(): Promise<
				| { readonly _tag: "done" }
				| { readonly _tag: "threw"; readonly message: string }
			> =>
				ffmpeg
					.ffprobe([...opts.args, "-o", PROBE_FILE])
					.then(() => ({ _tag: "done" as const }))
					.catch((cause) => ({
						_tag: "threw" as const,
						message:
							cause instanceof Error && cause.message
								? cause.message
								: opts.unreadable,
					})),
		);

		if (result._tag === "threw") {
			yield* disposeEngine;
			return yield* Effect.fail(opts.error(result.message));
		}
		// The exit code is not checked: core-mt 0.12.10's ffprobe returns -1 even
		// on success (checked in the browser). probe.json is the signal: a failed
		// probe leaves none or leaves invalid JSON, which the caller's parse
		// rejects.
		const data = yield* Effect.tryPromise({
			try: () => ffmpeg.readFile(PROBE_FILE),
			catch: () => opts.error(opts.unreadable),
		});
		return typeof data === "string" ? data : new TextDecoder().decode(data);
	}).pipe(
		Effect.ensuring(
			Effect.tryPromise(() => ffmpeg.deleteFile(PROBE_FILE)).pipe(
				Effect.ignore,
			),
		),
	);
};

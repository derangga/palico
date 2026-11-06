// Waveform peaks for one audio file. Starts once the player knows the duration,
// so a very long file is skipped before any decoding. Failure is non-fatal:
// the page trims by time without a waveform.

import { Effect, Exit } from "effect";
import { useEffect, useState } from "react";

import { deviceClass } from "#/components/video-cutter/utils.ts";
import {
	decodePeaks,
	WAVEFORM_MAX_SECONDS,
	waveformMaxBytes,
} from "#/lib/video/waveform.ts";

export type WaveformState =
	| { readonly status: "decoding" }
	| { readonly status: "ready"; readonly peaks: ReadonlyArray<number> }
	| { readonly status: "unavailable" };

const DECODING: WaveformState = { status: "decoding" };
const UNAVAILABLE: WaveformState = { status: "unavailable" };

export function useWaveform(
	file: File | null,
	duration: number,
): WaveformState {
	const [done, setDone] = useState<{
		file: File;
		state: WaveformState;
	} | null>(null);

	const tooLong = duration > WAVEFORM_MAX_SECONDS;

	useEffect(() => {
		if (!file || duration <= 0 || tooLong) return;

		let cancelled = false;

		Effect.runPromiseExit(
			decodePeaks(file, waveformMaxBytes(deviceClass())),
		).then((exit) => {
			if (cancelled) return;

			setDone({
				file,
				state: Exit.isSuccess(exit)
					? { status: "ready", peaks: exit.value }
					: UNAVAILABLE,
			});
		});

		return () => {
			cancelled = true;
		};
	}, [file, duration, tooLong]);

	if (tooLong) return UNAVAILABLE;

	return done && done.file === file ? done.state : DECODING;
}

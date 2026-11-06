// Waveform peaks for the audio cutter's timeline.
//
// Pure DOM (no @ffmpeg/*): the browser decodes the file, so the page can draw the
// waveform the moment a file is picked, independent of the trim engine. Like the
// filmstrip (thumbnails.ts) it is progressive enhancement: any failure here means
// "no waveform", never "cannot trim".

import { Effect, Schema } from "effect";

import { m } from "#/paraglide/messages.js";

import { type DeviceClass, MB } from "./limits.ts";

export class WaveformError extends Schema.TaggedError<WaveformError>()(
	"WaveformError",
	{ message: Schema.String },
) {}

// Peaks stored per file. The drawing pools them down to one bar per ~5 px.
export const PEAK_BUCKETS = 512;

// decodeAudioData holds the whole decoded file in memory. Chromium probably
// decodes at the file's own rate and resamples afterwards (inference, not
// measured), so budget for 44.1 kHz stereo floats: about 320 MB at 15 minutes.
// Longer files skip the waveform. Guesses to tune on a real phone.
export const WAVEFORM_MAX_SECONDS = 15 * 60;

export const waveformMaxBytes = (device: DeviceClass): number =>
	(device === "mobile" ? 25 : 60) * MB;

// Horizontal space one bar takes in path units (bar plus gap).
export const BAR_PITCH = 5;

// Largest absolute sample per bucket across all channels, scaled so the loudest
// bucket is 1. Silence stays all zeros.
export const computePeaks = (
	channels: ReadonlyArray<Float32Array>,
	buckets: number,
): number[] => {
	const peaks = Array.from({ length: Math.max(0, buckets) }, () => 0);
	const length = channels[0]?.length ?? 0;

	if (length === 0 || peaks.length === 0) return peaks;

	for (const data of channels) {
		for (let b = 0; b < peaks.length; b++) {
			const from = Math.floor((b * length) / peaks.length);

			const to = Math.max(
				from + 1,
				Math.floor(((b + 1) * length) / peaks.length),
			);

			let max = peaks[b] ?? 0;

			for (let i = from; i < to && i < data.length; i++) {
				max = Math.max(max, Math.abs(data[i] ?? 0));
			}

			peaks[b] = max;
		}
	}

	const top = Math.max(...peaks);

	return top > 0 ? peaks.map((p) => p / top) : peaks;
};

const round = (n: number) => Math.round(n * 100) / 100;

// One vertical segment per bar, mirrored around the centerline, as the `d` of a
// single <path>. A bar is never under 2 units tall, so silence still draws a line.
export const peaksToPath = (
	peaks: ReadonlyArray<number>,
	bars: number,
	height: number,
): string => {
	if (bars <= 0 || peaks.length === 0) return "";

	const mid = height / 2;
	const maxHalf = Math.max(1, mid - 2);
	let d = "";

	for (let i = 0; i < bars; i++) {
		const from = Math.floor((i * peaks.length) / bars);
		const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / bars));
		let peak = 0;

		for (let j = from; j < to; j++) peak = Math.max(peak, peaks[j] ?? 0);

		const half = Math.max(1, peak * maxHalf);
		const x = i * BAR_PITCH + BAR_PITCH / 2;
		d += `M${x} ${round(mid - half)}V${round(mid + half)}`;
	}

	return d;
};

const unreadable = () => m.error_waveform_unsupported();

// An offline context needs no audio device and no user gesture. A low sample
// rate makes decodeAudioData resample while decoding, which bounds the memory.
// Some browsers reject 8000 Hz, so retry at 22050.
const openContext = (rate: number) =>
	Effect.try({
		try: () => new OfflineAudioContext(1, 1, rate),
		catch: () => new WaveformError({ message: unreadable() }),
	});

// Decode the file and reduce it to PEAK_BUCKETS peaks (0 to 1). Fails with
// WaveformError when the file is over `maxBytes` or the browser cannot decode it.
export const decodePeaks = (
	file: File,
	maxBytes: number,
): Effect.Effect<number[], WaveformError> =>
	Effect.gen(function* () {
		if (file.size > maxBytes) {
			return yield* new WaveformError({
				message: m.error_waveform_too_large(),
			});
		}

		const context = yield* openContext(8000).pipe(
			Effect.catch(() => openContext(22050)),
		);

		const buffer = yield* Effect.tryPromise({
			try: async () => context.decodeAudioData(await file.arrayBuffer()),
			catch: () => new WaveformError({ message: unreadable() }),
		});

		const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
			buffer.getChannelData(c),
		);

		return computePeaks(channels, PEAK_BUCKETS);
	});

// Filmstrip thumbnail extraction for the trim timeline.
//
// Pure DOM (no @ffmpeg/*): decodes a handful of frames from an offscreen
// <video> + canvas, so the route can static-import this and start generating as
// soon as a file is picked — independent of the trim engine. Frames come back
// as small JPEG data URLs (no object-URL lifecycle to manage in the component).

import { Effect, Schema } from "effect";

export class ThumbnailError extends Schema.TaggedError<ThumbnailError>()(
	"ThumbnailError",
	{ message: Schema.String },
) {}

// Resolve once `event` fires; reject on the element's `error` or a timeout, so a
// codec/container that can't seek can never hang the extraction forever.
const waitFor = (
	el: HTMLVideoElement,
	event: string,
	timeoutMs: number,
): Promise<void> =>
	new Promise((resolve, reject) => {
		let settled = false;

		const cleanup = () => {
			el.removeEventListener(event, onEvent);
			el.removeEventListener("error", onError);
			clearTimeout(timer);
		};

		const onEvent = () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve();
		};

		const onError = () => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(new Error(`video "${event}" failed`));
		};

		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(new Error(`video "${event}" timed out`));
		}, timeoutMs);

		el.addEventListener(event, onEvent, { once: true });
		el.addEventListener("error", onError, { once: true });
	});

const extract = async (
	file: File,
	count: number,
	frameWidth: number,
): Promise<string[]> => {
	const url = URL.createObjectURL(file);
	const video = document.createElement("video");
	video.preload = "auto";
	video.muted = true;
	video.playsInline = true;
	video.src = url;

	try {
		await waitFor(video, "loadedmetadata", 15000);
		// Best-effort: some browsers need a decoded frame before seeks paint.
		await waitFor(video, "loadeddata", 15000).catch(() => {});

		const duration = video.duration;

		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error("Could not read the video duration.");
		}

		const vw = video.videoWidth || 16;
		const vh = video.videoHeight || 9;
		const w = frameWidth;
		const h = Math.max(1, Math.round((w * vh) / vw));

		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext("2d");

		if (!ctx) throw new Error("Canvas 2D context unavailable.");

		const urls: string[] = [];

		for (let i = 0; i < count; i++) {
			// Sample the middle of each evenly-sized slice; clamp off the last frame
			// so we never seek exactly to the (sometimes empty) end.
			const t = Math.min(((i + 0.5) / count) * duration, duration - 0.05);
			video.currentTime = Math.max(0, t);
			// Sequential by design: a single <video> element has one seek cursor,
			// so each frame must be sampled after its own seek resolves —
			// Promise.all would race a shared, single-position element.
			// react-doctor-disable-next-line react-doctor/async-await-in-loop
			await waitFor(video, "seeked", 10000);
			ctx.drawImage(video, 0, 0, w, h);
			urls.push(canvas.toDataURL("image/jpeg", 0.6));
		}

		return urls;
	} finally {
		URL.revokeObjectURL(url);
		video.removeAttribute("src");
		video.load();
	}
};

// Extract `count` evenly-spaced frames. Fails with ThumbnailError; the caller
// treats failure as "no filmstrip" and falls back to a plain track.
export const generateThumbnails = (
	file: File,
	count = 12,
	frameWidth = 160,
): Effect.Effect<ReadonlyArray<string>, ThumbnailError> =>
	Effect.tryPromise({
		try: () => extract(file, count, frameWidth),
		catch: (cause) =>
			new ThumbnailError({
				message:
					cause instanceof Error ? cause.message : "Could not read frames.",
			}),
	});

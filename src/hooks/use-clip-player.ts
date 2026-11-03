// Preview player for picking a range out of one video, shared by /video-cutter
// and /video-to-gif. Owns the <video> element, its object URL, the playhead,
// the selection and the filmstrip. Tool-specific job state stays in the route.
//
// The playhead is driven by a continuous rAF that reads the <video> element, so
// it tracks smoothly during playback and stays right after a seek or pause.
// Playback pauses at the selection end; it never loops (docs/video-cutter.md,
// problems 1 and 2).

import { Effect, Exit } from "effect";
import { useEffect, useReducer, useRef } from "react";

import { generateThumbnails } from "#/lib/video/thumbnails.ts";

export interface ClipPlayerState {
	file: File | null;
	objectUrl: string | null;
	duration: number;
	// Display size of the picture, from the <video> element. 0 until metadata.
	videoWidth: number;
	videoHeight: number;
	start: number;
	end: number;
	currentTime: number;
	isPlaying: boolean;
	thumbnails: string[];
}

const initialState: ClipPlayerState = {
	file: null,
	objectUrl: null,
	duration: 0,
	videoWidth: 0,
	videoHeight: 0,
	start: 0,
	end: 0,
	currentTime: 0,
	isPlaying: false,
	thumbnails: [],
};

type Action =
	| { type: "openFile"; file: File; objectUrl: string }
	| {
			type: "loadedMetadata";
			duration: number;
			end: number;
			videoWidth: number;
			videoHeight: number;
	  }
	| { type: "setCurrentTime"; value: number }
	| { type: "setStart"; value: number }
	| { type: "setEnd"; value: number }
	| { type: "setPlaying"; value: boolean }
	| { type: "setThumbnails"; value: string[] }
	| { type: "reset" };

function reducer(state: ClipPlayerState, action: Action): ClipPlayerState {
	switch (action.type) {
		case "openFile":
			return {
				...initialState,
				file: action.file,
				objectUrl: action.objectUrl,
			};
		case "loadedMetadata":
			return {
				...state,
				duration: action.duration,
				videoWidth: action.videoWidth,
				videoHeight: action.videoHeight,
				start: 0,
				end: action.end,
				currentTime: 0,
			};
		// Driven by a per-frame rAF loop: return the SAME state when the value is
		// unchanged so useReducer bails out of the render while paused.
		case "setCurrentTime":
			return state.currentTime === action.value
				? state
				: { ...state, currentTime: action.value };
		case "setStart":
			return { ...state, start: action.value };
		case "setEnd":
			return { ...state, end: action.value };
		case "setPlaying":
			return { ...state, isPlaying: action.value };
		case "setThumbnails":
			return { ...state, thumbnails: action.value };
		// Drops the file and preview but leaves duration/start/end/thumbnails;
		// the next openFile clears them.
		case "reset":
			return { ...state, objectUrl: null, file: null, isPlaying: false };
	}
}

const wholeVideo = (duration: number) => duration;

export function useClipPlayer({
	initialEnd = wholeVideo,
}: {
	// Where the selection ends when a video loads. Defaults to the whole video.
	initialEnd?: (duration: number) => number;
} = {}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const objectUrlRef = useRef<string | null>(null);
	const [state, dispatch] = useReducer(reducer, initialState);
	const { file, objectUrl, start, end, currentTime } = state;

	// Revoke the preview URL on unmount. Reading objectUrlRef.current at unmount
	// is intentional: earlier URLs are already revoked on file change and reset.
	// react-doctor-disable-next-line react-doctor/exhaustive-deps
	useEffect(() => {
		return () => {
			if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		};
	}, []);

	useEffect(() => {
		if (!objectUrl) return;
		let raf = 0;

		const tick = () => {
			const v = videoRef.current;

			if (v) {
				if (!v.paused && v.currentTime >= end) {
					v.pause();
					v.currentTime = end;
				}

				dispatch({ type: "setCurrentTime", value: v.currentTime });
			}

			// oxlint-disable-next-line react/immutability -- raf is local to this effect and never read during render.
			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(raf);
	}, [objectUrl, end]);

	// Build the filmstrip as soon as a file is picked. Failure is non-fatal: the
	// timeline renders a plain track.
	useEffect(() => {
		if (!file) {
			dispatch({ type: "setThumbnails", value: [] });

			return;
		}

		let cancelled = false;
		Effect.runPromiseExit(generateThumbnails(file)).then((exit) => {
			if (cancelled) return;

			if (Exit.isSuccess(exit))
				dispatch({ type: "setThumbnails", value: [...exit.value] });
		});

		return () => {
			cancelled = true;
		};
	}, [file]);

	function openFile(f: File) {
		if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
		const url = URL.createObjectURL(f);
		objectUrlRef.current = url;
		dispatch({ type: "openFile", file: f, objectUrl: url });
	}

	function reset() {
		if (objectUrlRef.current) {
			URL.revokeObjectURL(objectUrlRef.current);
			objectUrlRef.current = null;
		}

		dispatch({ type: "reset" });
	}

	function onLoadedMetadata() {
		const v = videoRef.current;

		if (!v) return;
		const d = Number.isFinite(v.duration) ? v.duration : 0;
		dispatch({
			type: "loadedMetadata",
			duration: d,
			end: initialEnd(d),
			videoWidth: v.videoWidth,
			videoHeight: v.videoHeight,
		});
	}

	function seekTo(sec: number) {
		const v = videoRef.current;

		if (!v) return;
		// Keep the playhead inside the kept range so it can't sit in the dimmed regions.
		const clamped = Math.min(Math.max(sec, start), end);
		v.currentTime = clamped;
		dispatch({ type: "setCurrentTime", value: clamped });
	}

	function restart() {
		const v = videoRef.current;

		if (!v) return;
		v.currentTime = start;
		dispatch({ type: "setCurrentTime", value: start });
		void v.play();
	}

	function togglePlay() {
		const v = videoRef.current;

		if (!v) return;

		if (v.paused) {
			if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
			void v.play();
		} else {
			v.pause();
		}
	}

	function changeStart(sec: number) {
		dispatch({ type: "setStart", value: sec });

		if (currentTime < sec) seekTo(sec);
	}

	function changeEnd(sec: number) {
		dispatch({ type: "setEnd", value: sec });

		if (currentTime > sec) seekTo(sec);
	}

	function setPlaying(value: boolean) {
		dispatch({ type: "setPlaying", value });
	}

	return {
		...state,
		videoRef,
		openFile,
		reset,
		onLoadedMetadata,
		seekTo,
		restart,
		togglePlay,
		changeStart,
		changeEnd,
		setPlaying,
	};
}

export type ClipPlayer = ReturnType<typeof useClipPlayer>;

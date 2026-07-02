export interface TrimOutput {
	blob: Blob;
	name: string;
	size: number;
}

export interface CutterState {
	file: File | null;
	objectUrl: string | null;
	duration: number;
	start: number;
	end: number;
	currentTime: number;
	isPlaying: boolean;
	thumbnails: string[];
	trimming: boolean;
	cancelling: boolean;
	output: TrimOutput | null;
}

export const initialCutterState: CutterState = {
	file: null,
	objectUrl: null,
	duration: 0,
	start: 0,
	end: 0,
	currentTime: 0,
	isPlaying: false,
	thumbnails: [],
	trimming: false,
	cancelling: false,
	output: null,
};

export type CutterAction =
	| { type: "openFile"; file: File; objectUrl: string }
	| { type: "loadedMetadata"; duration: number }
	| { type: "setCurrentTime"; value: number }
	| { type: "setStart"; value: number }
	| { type: "setEnd"; value: number }
	| { type: "setPlaying"; value: boolean }
	| { type: "setThumbnails"; value: string[] }
	| { type: "reset" }
	| { type: "trimStart" }
	| { type: "trimSuccess"; output: TrimOutput }
	| { type: "trimEnd" }
	| { type: "cancelStart" }
	| { type: "cancelEnd" };

export function cutterReducer(
	state: CutterState,
	action: CutterAction,
): CutterState {
	switch (action.type) {
		case "openFile":
			return {
				...state,
				objectUrl: action.objectUrl,
				file: action.file,
				output: null,
				isPlaying: false,
				thumbnails: [],
				duration: 0,
				start: 0,
				end: 0,
				currentTime: 0,
			};
		case "loadedMetadata":
			return {
				...state,
				duration: action.duration,
				start: 0,
				end: action.duration,
				currentTime: 0,
			};
		// Driven by a per-frame rAF loop: return the SAME state when the value is
		// unchanged so useReducer bails out of the render (matches the original
		// setCurrentTime no-op, which mattered while paused).
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
		// Mirrors the original reset(): drops the file/preview/output and pauses,
		// but leaves duration/start/end/thumbnails (the next openFile clears them).
		case "reset":
			return {
				...state,
				objectUrl: null,
				file: null,
				output: null,
				isPlaying: false,
			};
		case "trimStart":
			return { ...state, trimming: true, output: null };
		case "trimSuccess":
			return { ...state, output: action.output };
		case "trimEnd":
			return { ...state, trimming: false };
		case "cancelStart":
			return { ...state, cancelling: true };
		case "cancelEnd":
			return { ...state, trimming: false, cancelling: false };
	}
}

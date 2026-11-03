import { type AudioFormat, DEFAULT_AUDIO_FORMAT } from "#/lib/video/audio.ts";

export interface AudioResult {
	blob: Blob;
	name: string;
	size: number;
}

export interface ExtractState {
	file: File | null;
	format: AudioFormat;
	extracting: boolean;
	cancelling: boolean;
	// 0 until ffmpeg reports progress; a stream copy never does.
	percent: number;
	output: AudioResult | null;
}

export const initialExtractState: ExtractState = {
	file: null,
	format: DEFAULT_AUDIO_FORMAT,
	extracting: false,
	cancelling: false,
	percent: 0,
	output: null,
};

export type ExtractAction =
	| { type: "openFile"; file: File }
	| { type: "reset" }
	| { type: "setFormat"; value: AudioFormat }
	| { type: "extractStart" }
	| { type: "progress"; percent: number }
	| { type: "extractSuccess"; output: AudioResult }
	| { type: "extractEnd" }
	| { type: "cancelStart" }
	| { type: "cancelEnd" };

export function extractReducer(
	state: ExtractState,
	action: ExtractAction,
): ExtractState {
	switch (action.type) {
		case "openFile":
			return { ...state, file: action.file, output: null };
		case "reset":
			return { ...state, file: null, output: null };
		case "setFormat":
			// A new format makes the old result stale.
			return { ...state, format: action.value, output: null };
		case "extractStart":
			return { ...state, extracting: true, percent: 0, output: null };
		case "progress":
			return { ...state, percent: action.percent };
		case "extractSuccess":
			return { ...state, output: action.output };
		case "extractEnd":
			return { ...state, extracting: false };
		case "cancelStart":
			return { ...state, cancelling: true };
		case "cancelEnd":
			return { ...state, extracting: false, cancelling: false };
	}
}

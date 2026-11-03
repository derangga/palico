// GIF job and settings state for /video-to-gif. The preview player state (file,
// selection, playhead) lives in useClipPlayer.

import {
	DEFAULT_GIF_FPS,
	DEFAULT_GIF_SIZE,
	type GifFps,
	type GifSize,
} from "#/lib/video/gif-options.ts";

export interface GifResult {
	blob: Blob;
	name: string;
	size: number;
}

export interface GifState {
	fps: GifFps;
	size: GifSize;
	making: boolean;
	cancelling: boolean;
	output: GifResult | null;
}

export const initialGifState: GifState = {
	fps: DEFAULT_GIF_FPS,
	size: DEFAULT_GIF_SIZE,
	making: false,
	cancelling: false,
	output: null,
};

export type GifAction =
	| { type: "setFps"; value: GifFps }
	| { type: "setSize"; value: GifSize }
	| { type: "clearOutput" }
	| { type: "makeStart" }
	| { type: "makeSuccess"; output: GifResult }
	| { type: "makeEnd" }
	| { type: "cancelStart" }
	| { type: "cancelEnd" };

export function gifReducer(state: GifState, action: GifAction): GifState {
	switch (action.type) {
		case "setFps":
			return { ...state, fps: action.value };
		case "setSize":
			return { ...state, size: action.value };
		case "clearOutput":
			return { ...state, output: null };
		case "makeStart":
			return { ...state, making: true, output: null };
		case "makeSuccess":
			return { ...state, output: action.output };
		case "makeEnd":
			return { ...state, making: false };
		case "cancelStart":
			return { ...state, cancelling: true };
		case "cancelEnd":
			return { ...state, making: false, cancelling: false };
	}
}

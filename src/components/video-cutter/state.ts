// Trim job state for /video-cutter. The preview player state (file, selection,
// playhead) lives in useClipPlayer.

export interface TrimOutput {
	blob: Blob;
	name: string;
	size: number;
}

export interface CutterState {
	trimming: boolean;
	cancelling: boolean;
	output: TrimOutput | null;
}

export const initialCutterState: CutterState = {
	trimming: false,
	cancelling: false,
	output: null,
};

export type CutterAction =
	| { type: "clearOutput" }
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
		case "clearOutput":
			return { ...state, output: null };
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

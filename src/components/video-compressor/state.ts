import {
	CompressMode,
	type CompressQuality,
	checkCustomSize,
	DEFAULT_QUALITY,
	DEFAULT_RESOLUTION,
	DEFAULT_SIZE_CHOICE,
	isUnderTarget,
	type Resolution,
	SIZE_PRESETS,
	type SizeChoice,
	startsOnQuality,
} from "#/lib/video/compress-options.ts";
import { m } from "#/paraglide/messages.js";

export type CompressResult =
	| {
			kind: "compressed";
			blob: Blob;
			name: string;
			size: number;
			// The target it went over, or null when it fit.
			overTargetMB: number | null;
	  }
	| { kind: "kept" };

export type ModeTab = "size" | "quality";

export interface CompressState {
	file: File | null;
	tab: ModeTab;
	sizeChoice: SizeChoice;
	customMB: string;
	quality: CompressQuality;
	resolution: Resolution;
	compressing: boolean;
	cancelling: boolean;
	percent: number;
	// TargetTooSmallError's message, shown under the size field.
	sizeError: string | null;
	output: CompressResult | null;
}

export const initialCompressState: CompressState = {
	file: null,
	tab: "size",
	sizeChoice: DEFAULT_SIZE_CHOICE,
	customMB: "",
	quality: DEFAULT_QUALITY,
	resolution: DEFAULT_RESOLUTION,
	compressing: false,
	cancelling: false,
	percent: 0,
	sizeError: null,
	output: null,
};

export type CompressAction =
	| { type: "openFile"; file: File }
	| { type: "reset" }
	| { type: "setTab"; value: ModeTab }
	| { type: "setSizeChoice"; value: SizeChoice }
	| { type: "setCustomMB"; value: string }
	| { type: "setQuality"; value: CompressQuality }
	| { type: "setResolution"; value: Resolution }
	| { type: "compressStart" }
	| { type: "progress"; percent: number }
	| { type: "compressSuccess"; output: CompressResult }
	| { type: "sizeError"; message: string }
	| { type: "compressEnd" }
	| { type: "cancelStart" }
	| { type: "cancelEnd" };

// Any setting change makes the old result and the size error stale.
const stale = { output: null, sizeError: null } as const;

export function compressReducer(
	state: CompressState,
	action: CompressAction,
): CompressState {
	switch (action.type) {
		case "openFile":
			return {
				...state,
				...stale,
				file: action.file,
				tab: startsOnQuality(action.file.size) ? "quality" : "size",
				// 25 MB would not shrink a file already under it, so start on 10 MB.
				sizeChoice: isUnderTarget(action.file.size, 25) ? "10" : "25",
			};
		case "reset":
			return { ...state, ...stale, file: null };
		case "setTab":
			return { ...state, ...stale, tab: action.value };
		case "setSizeChoice":
			return { ...state, ...stale, sizeChoice: action.value };
		case "setCustomMB":
			return { ...state, ...stale, customMB: action.value };
		case "setQuality":
			return { ...state, ...stale, quality: action.value };
		case "setResolution":
			return { ...state, ...stale, resolution: action.value };
		case "compressStart":
			return { ...state, ...stale, compressing: true, percent: 0 };
		case "progress":
			return { ...state, percent: action.percent };
		case "compressSuccess":
			return { ...state, output: action.output };
		case "sizeError":
			return { ...state, sizeError: action.message };
		case "compressEnd":
			return { ...state, compressing: false };
		case "cancelStart":
			return { ...state, cancelling: true };
		case "cancelEnd":
			return { ...state, compressing: false, cancelling: false };
	}
}

export type ModeVerdict =
	| { kind: "ok"; mode: CompressMode }
	| { kind: "invalid"; message: string };

// The panel's settings as the pipeline's mode, or why Compress is disabled.
export function resolveMode(state: CompressState, file: File): ModeVerdict {
	if (state.tab === "quality") {
		return {
			kind: "ok",
			mode: CompressMode.cases.quality.make({ quality: state.quality }),
		};
	}

	let mb: number;

	if (state.sizeChoice === "custom") {
		const verdict = checkCustomSize(state.customMB, file.size);

		if (verdict.kind === "invalid") return verdict;
		mb = verdict.mb;
	} else {
		const choice = state.sizeChoice;
		mb = SIZE_PRESETS.find((p) => p.value === choice)?.mb ?? 25;

		if (isUnderTarget(file.size, mb)) {
			return {
				kind: "invalid",
				message: m.videocomp_already_under({ mb }),
			};
		}
	}

	return { kind: "ok", mode: CompressMode.cases.size.make({ targetMB: mb }) };
}

import type { ResizeOutput } from "#/lib/image/resizer.ts";

export type Mode = "pixels" | "percent";
export type Status = "idle" | "processing" | "done" | "error";

export interface Source {
	file: File;
	srcW: number;
	srcH: number;
}

export const toInt = (v: string) => {
	const n = Number.parseInt(v, 10);
	return Number.isFinite(n) && n > 0 ? n : 0;
};

export interface ResizeState {
	source: Source | null;
	mode: Mode;
	pxWidth: string;
	pxHeight: string;
	maintainAR: boolean;
	noEnlarge: boolean;
	pct: number;
	status: Status;
	result: ResizeOutput | null;
	errorMsg: string | null;
}

export const initialResizeState: ResizeState = {
	source: null,
	mode: "pixels",
	pxWidth: "",
	pxHeight: "",
	maintainAR: true,
	noEnlarge: true,
	pct: 50,
	status: "idle",
	result: null,
	errorMsg: null,
};

export type ResizeAction =
	| { type: "fileLoaded"; source: Source }
	| { type: "reset" }
	| { type: "clearResult" }
	| { type: "changeWidth"; value: string }
	| { type: "changeHeight"; value: string }
	| { type: "toggleMaintainAR"; on: boolean; lastEdited: "w" | "h" }
	| { type: "changePct"; value: number }
	| { type: "setMode"; mode: Mode }
	| { type: "setNoEnlarge"; value: boolean }
	| { type: "startProcessing" }
	| { type: "succeed"; result: ResizeOutput }
	| { type: "fail"; message: string }
	| { type: "cancel" };

// Editing any input clears a stale result — every "edit" action folds in the
// same reset the original clearResult() performed after each setter.
const CLEARED = { result: null, status: "idle" as Status, errorMsg: null };

export function resizeReducer(
	state: ResizeState,
	action: ResizeAction,
): ResizeState {
	switch (action.type) {
		case "fileLoaded": {
			const { srcW, srcH } = action.source;
			return {
				...state,
				...CLEARED,
				source: action.source,
				pxWidth: String(srcW),
				pxHeight: String(srcH),
				pct: 50,
			};
		}
		case "reset":
			return { ...state, ...CLEARED, source: null };
		case "clearResult":
			return { ...state, ...CLEARED };
		case "changeWidth": {
			const next: ResizeState = { ...state, ...CLEARED, pxWidth: action.value };
			// Maintain aspect ratio: derive the height from the new width.
			if (state.maintainAR && state.source) {
				const w = toInt(action.value);
				if (w > 0)
					next.pxHeight = String(
						Math.max(
							1,
							Math.round((w * state.source.srcH) / state.source.srcW),
						),
					);
			}
			return next;
		}
		case "changeHeight": {
			const next: ResizeState = {
				...state,
				...CLEARED,
				pxHeight: action.value,
			};
			if (state.maintainAR && state.source) {
				const h = toInt(action.value);
				if (h > 0)
					next.pxWidth = String(
						Math.max(
							1,
							Math.round((h * state.source.srcW) / state.source.srcH),
						),
					);
			}
			return next;
		}
		case "toggleMaintainAR": {
			const next: ResizeState = { ...state, ...CLEARED, maintainAR: action.on };
			// Re-derive the locked dimension from the current driver.
			if (action.on && state.source) {
				if (action.lastEdited === "w") {
					const w = toInt(state.pxWidth);
					if (w > 0)
						next.pxHeight = String(
							Math.max(
								1,
								Math.round((w * state.source.srcH) / state.source.srcW),
							),
						);
				} else {
					const h = toInt(state.pxHeight);
					if (h > 0)
						next.pxWidth = String(
							Math.max(
								1,
								Math.round((h * state.source.srcW) / state.source.srcH),
							),
						);
				}
			}
			return next;
		}
		case "changePct":
			// Capped at 100% — the resizer never upscales.
			return {
				...state,
				...CLEARED,
				pct: Math.min(100, Math.max(1, Math.round(action.value))),
			};
		case "setMode":
			return { ...state, ...CLEARED, mode: action.mode };
		case "setNoEnlarge":
			return { ...state, ...CLEARED, noEnlarge: action.value };
		case "startProcessing":
			return { ...state, status: "processing", errorMsg: null };
		case "succeed":
			return { ...state, result: action.result, status: "done" };
		case "fail":
			return { ...state, status: "error", errorMsg: action.message };
		case "cancel":
			return { ...state, status: "idle" };
	}
}

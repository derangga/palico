import { Schema } from "effect";

import type { PdfThumbnail } from "#/lib/file/pdf-types.ts";

export const SplitMode = Schema.Literals(["extract", "every-n", "all"]);

export type SplitMode = typeof SplitMode.Type;

export interface SplitState {
	file: File | null;
	thumbnails: ReadonlyArray<PdfThumbnail>;
	pageCount: number;
	rendering: boolean;
	mode: SplitMode;
	selected: ReadonlySet<number>;
	everyN: number;
	working: boolean;
}

export const initialSplitState: SplitState = {
	file: null,
	thumbnails: [],
	pageCount: 0,
	rendering: false,
	mode: "extract",
	selected: new Set(),
	everyN: 2,
	working: false,
};

export type SplitAction =
	| { type: "loadStart"; file: File }
	| { type: "addThumbnail"; thumbnail: PdfThumbnail }
	| { type: "loadSuccess"; pageCount: number }
	| { type: "reset" }
	| { type: "toggle"; index: number }
	| { type: "selectAll" }
	| { type: "clearSelected" }
	| { type: "setMode"; mode: SplitMode }
	| { type: "setEveryN"; value: number }
	| { type: "workStart" }
	| { type: "workEnd" };

export function splitReducer(
	state: SplitState,
	action: SplitAction,
): SplitState {
	switch (action.type) {
		case "loadStart":
			return {
				...state,
				file: action.file,
				thumbnails: [],
				pageCount: 0,
				selected: new Set(),
				rendering: true,
			};
		case "addThumbnail":
			return { ...state, thumbnails: [...state.thumbnails, action.thumbnail] };
		case "loadSuccess":
			return { ...state, rendering: false, pageCount: action.pageCount };
		// Mirrors the original reset(): clears the document, thumbnails, selection
		// and mode, but leaves everyN and working untouched.
		case "reset":
			return {
				...state,
				file: null,
				thumbnails: [],
				pageCount: 0,
				selected: new Set(),
				rendering: false,
				mode: "extract",
			};
		case "toggle": {
			const next = new Set(state.selected);

			if (next.has(action.index)) next.delete(action.index);
			else next.add(action.index);

			return { ...state, selected: next };
		}

		case "selectAll":
			return {
				...state,
				selected: new Set(state.thumbnails.map((t) => t.index)),
			};
		case "clearSelected":
			return { ...state, selected: new Set() };
		case "setMode":
			return { ...state, mode: action.mode };
		case "setEveryN":
			return { ...state, everyN: action.value };
		case "workStart":
			return { ...state, working: true };
		case "workEnd":
			return { ...state, working: false };
	}
}

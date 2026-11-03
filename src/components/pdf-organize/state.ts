import type { PdfThumbnail, Rotation } from "#/lib/file/pdf-types.ts";

const ROTATIONS = [0, 90, 180, 270] as const;

// Quarter turn clockwise (dir 1) or anticlockwise (dir -1).
const rotate = (rotation: Rotation, dir: 1 | -1): Rotation =>
	ROTATIONS[(ROTATIONS.indexOf(rotation) + dir + 4) % 4];

import { moveItem } from "#/lib/reorder.ts";

export type OrganizePage = {
	readonly key: string; // stable React key: the original index
	readonly sourceIndex: number; // 0-based index in the original file
	readonly rotation: Rotation; // degrees added to the page's own rotation
	readonly thumbnail: PdfThumbnail;
};

export interface OrganizeState {
	file: File | null;
	// Every rendered page in original order, so "Restore all" can rebuild.
	loaded: ReadonlyArray<PdfThumbnail>;
	pages: ReadonlyArray<OrganizePage>;
	rendering: boolean;
	saving: boolean;
}

export const initialOrganizeState: OrganizeState = {
	file: null,
	loaded: [],
	pages: [],
	rendering: false,
	saving: false,
};

export type OrganizeAction =
	| { type: "loadStart"; file: File }
	| { type: "addThumbnail"; thumbnail: PdfThumbnail }
	| { type: "loadSuccess" }
	| { type: "reset" }
	| { type: "restore" }
	| { type: "move"; from: number; to: number }
	| { type: "rotate"; key: string; dir: 1 | -1 }
	| { type: "remove"; key: string }
	| { type: "saveStart" }
	| { type: "saveEnd" };

const toPage = (thumbnail: PdfThumbnail): OrganizePage => ({
	key: String(thumbnail.index),
	sourceIndex: thumbnail.index,
	rotation: 0,
	thumbnail,
});

export function organizeReducer(
	state: OrganizeState,
	action: OrganizeAction,
): OrganizeState {
	switch (action.type) {
		case "loadStart":
			return {
				...initialOrganizeState,
				file: action.file,
				rendering: true,
			};
		case "addThumbnail":
			return {
				...state,
				loaded: [...state.loaded, action.thumbnail],
				pages: [...state.pages, toPage(action.thumbnail)],
			};
		case "loadSuccess":
			return { ...state, rendering: false };
		case "reset":
			return initialOrganizeState;
		case "restore":
			return { ...state, pages: state.loaded.map(toPage) };
		case "move":
			return { ...state, pages: moveItem(state.pages, action.from, action.to) };
		case "rotate":
			return {
				...state,
				pages: state.pages.map((page) =>
					page.key === action.key
						? {
								...page,
								rotation: rotate(page.rotation, action.dir),
							}
						: page,
				),
			};
		case "remove":
			return {
				...state,
				pages: state.pages.filter((page) => page.key !== action.key),
			};
		case "saveStart":
			return { ...state, saving: true };
		case "saveEnd":
			return { ...state, saving: false };
	}
}

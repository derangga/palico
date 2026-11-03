import type { Item } from "#/components/video-converter/types.ts";
import type { VideoProgressUpdate } from "#/lib/video/converter.ts";
import type { VideoOutputFormat } from "#/lib/video/types.ts";

export interface ConverterState {
	items: Item[];
	format: VideoOutputFormat;
	isRunning: boolean;
	batchTotal: number;
	batchDone: number;
	// Process-time warning dialog: `pending` holds the targets awaiting the
	// user's confirmation; null means no dialog is open.
	pending: Item[] | null;
	dontShowAgain: boolean;
	// Cancellation: `confirmCancel` opens the confirm dialog; `cancelling`
	// disables the button during the terminate window.
	confirmCancel: boolean;
	cancelling: boolean;
}

export const initialConverterState: ConverterState = {
	items: [],
	format: "mp4",
	isRunning: false,
	batchTotal: 0,
	batchDone: 0,
	pending: null,
	dontShowAgain: false,
	confirmCancel: false,
	cancelling: false,
};

export type ConverterAction =
	| { type: "addItems"; items: Item[] }
	| { type: "removeItem"; id: string }
	| { type: "reset" }
	| { type: "changeFormat"; format: VideoOutputFormat }
	| { type: "openPending"; targets: Item[] }
	| { type: "clearPending" }
	| { type: "setDontShowAgain"; value: boolean }
	| { type: "runStart"; total: number }
	| { type: "progressUpdate"; update: VideoProgressUpdate; formatLabel: string }
	| { type: "batchTick" }
	| { type: "runEnd" }
	| { type: "setConfirmCancel"; value: boolean }
	| { type: "cancelStart" }
	| { type: "cancelReset" };

export function converterReducer(
	state: ConverterState,
	action: ConverterAction,
): ConverterState {
	switch (action.type) {
		case "addItems":
			return { ...state, items: [...state.items, ...action.items] };
		case "removeItem":
			return {
				...state,
				items: state.items.filter((item) => item.id !== action.id),
			};
		case "reset":
			return { ...state, items: [] };
		case "changeFormat":
			// Completed/failed items become re-convertable when the target format
			// changes, mirroring the image converter UX.
			return {
				...state,
				format: action.format,
				items: state.items.map((item) =>
					item.status === "done" || item.status === "error"
						? {
								...item,
								status: "ready",
								percent: undefined,
								outBlob: undefined,
								outName: undefined,
								outSize: undefined,
								outLabel: undefined,
								message: undefined,
							}
						: item,
				),
			};
		case "openPending":
			return { ...state, pending: action.targets, dontShowAgain: false };
		case "clearPending":
			return { ...state, pending: null };
		case "setDontShowAgain":
			return { ...state, dontShowAgain: action.value };
		case "runStart":
			return {
				...state,
				isRunning: true,
				batchTotal: action.total,
				batchDone: 0,
			};
		case "progressUpdate": {
			const { update, formatLabel } = action;

			return {
				...state,
				items: state.items.map((item) => {
					if (item.id !== update.id) return item;

					if (update.status === "processing") {
						return {
							...item,
							status: "processing",
							percent: update.percent,
							message: undefined,
						};
					}

					if (update.status === "done") {
						return {
							...item,
							status: "done",
							percent: 100,
							outBlob: update.output.blob,
							outName: update.output.name,
							outSize: update.output.size,
							outLabel: formatLabel,
							message: undefined,
						};
					}

					return {
						...item,
						status: "error",
						percent: undefined,
						message: update.error.message,
					};
				}),
			};
		}

		case "batchTick":
			return { ...state, batchDone: state.batchDone + 1 };
		case "runEnd":
			return { ...state, isRunning: false };
		case "setConfirmCancel":
			return { ...state, confirmCancel: action.value };
		case "cancelStart":
			return { ...state, confirmCancel: false, cancelling: true };
		// Reset queued/in-flight rows to "ready" while keeping finished downloads.
		case "cancelReset":
			return {
				...state,
				items: state.items.map((item) =>
					item.status === "processing" || item.status === "ready"
						? {
								...item,
								status: "ready",
								percent: undefined,
								message: undefined,
							}
						: item,
				),
				batchTotal: 0,
				batchDone: 0,
				isRunning: false,
				cancelling: false,
			};
	}
}

import {
	busyRef,
	notSavedRef,
	refreshRef,
	reloadNeededRef,
	shellRef,
	toStore,
	updateRef,
} from "./state.ts";

// React-facing views of the offline state (use with useSyncExternalStore).
export const shellStore = toStore(shellRef);
export const updateStore = toStore(updateRef);
export const reloadNeededStore = toStore(reloadNeededRef);
export const busyStore = toStore(busyRef);
export const notSavedStore = toStore(notSavedRef);
export const refreshStore = toStore(refreshRef);

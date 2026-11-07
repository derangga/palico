import type { OfflineStatus } from "./shapes.ts";

type Tag = OfflineStatus["_tag"];

// Whether the offline pill plays its state-change fade when it goes from `prev` to
// `next`. The fade is for the person's own action, never for a page load.
//
// A load always passes through the same states as an enabled visit does (Unavailable
// before the worker state is known, then Preparing), and a first visit settles on
// Off. So a change only counts once the pill has shown Off (`sawOff`): then Off to
// Preparing to Ready (or back to Unavailable after a failure) is the person turning
// offline on. The other way in is Stop: Ready to Off, which never happens on load.
export const shouldSwap = (prev: Tag, next: Tag, sawOff: boolean): boolean => {
	if (prev === next) return false;

	if (next === "Off") return prev === "Ready";

	return sawOff;
};

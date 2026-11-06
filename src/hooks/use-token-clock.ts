import { useCallback, useMemo, useSyncExternalStore } from "react";

// How often the clock looks. It re-renders the page only when the value it
// reports changes.
const CHECK_MS = 1000;

// Within this long of a boundary the clock reports whole seconds, so "expired"
// appears the second it is true. Farther out, 30 seconds is plenty for "in 3 days".
const NEAR_MS = 90_000;
const FINE_MS = 1000;
const COARSE_MS = 30_000;

function subscribe(onChange: () => void): () => void {
	const timer = window.setInterval(onChange, CHECK_MS);

	return () => window.clearInterval(timer);
}

const quantize = (now: number, boundaries: ReadonlyArray<number>): number => {
	const near = boundaries.some((at) => Math.abs(at - now) <= NEAR_MS);

	// Whole seconds near a boundary, rounded down so "expired" is never early. Farther
	// out it rounds up, so "in 12 minutes" never promises more time than there is.
	return near
		? Math.floor(now / FINE_MS) * FINE_MS
		: Math.ceil(now / COARSE_MS) * COARSE_MS;
};

// The server has no token and no clock that matches the visitor's.
const serverClock = () => 0;

/**
 * The present time in milliseconds, for judging a token against its `nbf` and
 * `exp` (`boundaries`, also in milliseconds). It is steady between ticks so the
 * page does not re-render for nothing.
 */
export function useTokenClock(boundaries: ReadonlyArray<number>): number {
	const key = boundaries.join(",");

	const stable = useMemo(
		() => (key === "" ? [] : key.split(",").map(Number)),
		[key],
	);

	const snapshot = useCallback(() => quantize(Date.now(), stable), [stable]);

	return useSyncExternalStore(subscribe, snapshot, serverClock);
}

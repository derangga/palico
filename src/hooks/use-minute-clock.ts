import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;
// Checked twice a minute. The snapshot only changes when the minute does, so
// the page re-renders once a minute.
const CHECK_MS = 30_000;

function subscribe(onChange: () => void): () => void {
	const timer = window.setInterval(onChange, CHECK_MS);

	return () => window.clearInterval(timer);
}

const currentMinute = () => Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;

// The server has no clock that matches the visitor's, so it renders without one
// and the browser fills it in after hydration.
const noClock = () => undefined;

/** The start of the current minute as a timestamp, or undefined on the server. */
export function useMinuteClock(): number | undefined {
	return useSyncExternalStore(subscribe, currentMinute, noClock);
}

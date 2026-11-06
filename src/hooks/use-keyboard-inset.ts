import { useCallback, useMemo, useSyncExternalStore } from "react";

export type KeyboardInset = {
	/** Pixels of the layout viewport the on-screen keyboard covers at the bottom. */
	bottom: number;
	/** Height of the part of the page still visible above the keyboard. */
	height: number;
};

// The snapshot is a string so React can compare it by value. An object would
// be a new reference on every read and re-render in a loop.
function readSnapshot(): string {
	const viewport = window.visualViewport;

	if (!viewport) return "";

	const bottom = Math.max(
		0,
		Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
	);

	return `${bottom}:${Math.round(viewport.height)}`;
}

const readServerSnapshot = () => "";

/**
 * Tracks the on-screen keyboard through `visualViewport`. On iOS Safari the
 * layout viewport does not shrink when the keyboard opens, so a `fixed` element
 * anchored to the bottom ends up behind it. Returns `null` while `active` is
 * false or when the browser has no `visualViewport`.
 */
export function useKeyboardInset(active: boolean): KeyboardInset | null {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const viewport = window.visualViewport;

			if (!active || !viewport) return () => {};

			viewport.addEventListener("resize", onChange);
			viewport.addEventListener("scroll", onChange);

			return () => {
				viewport.removeEventListener("resize", onChange);
				viewport.removeEventListener("scroll", onChange);
			};
		},
		[active],
	);

	const getSnapshot = useCallback(
		() => (active ? readSnapshot() : ""),
		[active],
	);

	const snapshot = useSyncExternalStore(
		subscribe,
		getSnapshot,
		readServerSnapshot,
	);

	return useMemo(() => {
		if (!snapshot) return null;

		const [bottom, height] = snapshot.split(":").map(Number);

		return { bottom, height };
	}, [snapshot]);
}

import { useEffect, useState } from "react";

export type KeyboardInset = {
	/** Pixels of the layout viewport the on-screen keyboard covers at the bottom. */
	bottom: number;
	/** Height of the part of the page still visible above the keyboard. */
	height: number;
};

/**
 * Tracks the on-screen keyboard through `visualViewport`. On iOS Safari the
 * layout viewport does not shrink when the keyboard opens, so a `fixed` element
 * anchored to the bottom ends up behind it. Returns `null` while `active` is
 * false or when the browser has no `visualViewport`.
 */
export function useKeyboardInset(active: boolean): KeyboardInset | null {
	const [inset, setInset] = useState<KeyboardInset | null>(null);

	useEffect(() => {
		const viewport = window.visualViewport;

		if (!active || !viewport) {
			setInset(null);
			return;
		}

		const update = () => {
			const bottom = Math.max(
				0,
				Math.round(window.innerHeight - viewport.height - viewport.offsetTop),
			);

			setInset((previous) =>
				previous?.bottom === bottom &&
				previous.height === Math.round(viewport.height)
					? previous
					: { bottom, height: Math.round(viewport.height) },
			);
		};

		update();
		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);

		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
		};
	}, [active]);

	return inset;
}

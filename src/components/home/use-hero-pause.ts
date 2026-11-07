import { type RefObject, useEffect } from "react";

/**
 * Pauses the hero's looping motion while nobody can see it: the tab is hidden, or
 * the hero has scrolled off screen. It toggles `data-paused` on the element
 * straight in the DOM, so nothing re-renders, and home.css turns that into
 * `animation-play-state: paused`. The loops live on Home only, so leaving the page
 * stops them for good.
 */
export function useHeroPause(ref: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const element = ref.current;

		if (!element) return;

		// The hero counts as in view until the observer says otherwise.
		const view = { offscreen: false };

		const apply = () => {
			if (document.hidden || view.offscreen) {
				element.setAttribute("data-paused", "");
			} else {
				element.removeAttribute("data-paused");
			}
		};

		document.addEventListener("visibilitychange", apply);

		// Without IntersectionObserver the loop only pauses with the tab.
		const observer =
			typeof IntersectionObserver === "undefined"
				? undefined
				: new IntersectionObserver((entries) => {
						const latest = entries.at(-1);

						if (latest) view.offscreen = !latest.isIntersecting;

						apply();
					});

		observer?.observe(element);
		apply();

		return () => {
			document.removeEventListener("visibilitychange", apply);
			observer?.disconnect();
			element.removeAttribute("data-paused");
		};
	}, [ref]);
}

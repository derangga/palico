import { useEffect, useLayoutEffect, useRef } from "react";

import { useToolHistory } from "#/hooks/use-tool-history.ts";

// Layout effects do nothing on the server (prerender); on the client they run
// before paint, so a client-side visit to Home never flashes the wrong hero.
const useBeforePaint =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

type FlagAction = "set" | "remove" | "keep";

/**
 * What to do with `data-returning` for this render. Pure, so the freeze rule can
 * be tested without a DOM.
 *
 * - Before the first decision (`decided` false) the history decides: set the
 *   attribute for a returning visitor, remove it otherwise. Nothing happens while
 *   the history is still `idle`.
 * - After that the attribute is never set again, so a first star cannot hide
 *   Start here mid-visit.
 * - After that it is removed once the row empties (`returning` false), so Home
 *   does not keep an empty gap where Start here belongs.
 */
export function returningFlagAction(input: {
	readonly decided: boolean;
	readonly phase: string;
	readonly returning: boolean;
	readonly attributeSet: boolean;
}): FlagAction {
	if (!input.decided) {
		if (input.phase === "idle") return "keep";

		return input.returning ? "set" : "remove";
	}

	return input.attributeSet && !input.returning ? "remove" : "keep";
}

/**
 * Sets `data-returning` on <html> for a visitor with a favourite or recent tool,
 * which home.css reads to hide "Start here".
 *
 * On a page load the pre-paint script in tool-history/prepaint.ts has already set
 * it from storage. When Home is reached by client-side navigation that script does
 * not run again, so this decides once the history has been read. Either way the
 * decision is made once per visit to Home: starring a starter tile later shows the
 * row but keeps Start here until the next visit, so the page never changes
 * character under the cursor. Blocked storage counts as a first-time visitor.
 *
 * The freeze holds in one direction only. When the history empties after the
 * decision (Clear on the last recent tool, or unstarring the last favourite), the
 * attribute is removed at once, before paint, so Start here comes back instead of
 * leaving a gap. It stays removed for the rest of the visit, so a later star does
 * not hide Start here again. The attribute is also removed when Home unmounts.
 * Why: docs/home-page.md.
 */
export function useReturningFlag() {
	const history = useToolHistory();
	const decided = useRef(false);

	useBeforePaint(() => {
		const root = document.documentElement;

		const action = returningFlagAction({
			decided: decided.current,
			phase: history.phase,
			returning: history.returning,
			attributeSet: root.dataset.returning !== undefined,
		});

		if (history.phase !== "idle") decided.current = true;

		if (action === "set") root.dataset.returning = "1";
		else if (action === "remove") delete root.dataset.returning;
	}, [history.phase, history.returning]);

	// Also clears `decided`, so the extra mount React Strict Mode runs in dev
	// decides again instead of leaving the attribute off.
	useBeforePaint(
		() => () => {
			decided.current = false;
			delete document.documentElement.dataset.returning;
		},
		[],
	);
}

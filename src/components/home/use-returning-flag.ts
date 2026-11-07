import { useEffect, useLayoutEffect, useRef } from "react";

import { useToolHistory } from "#/hooks/use-tool-history.ts";

// Layout effects do nothing on the server (prerender); on the client they run
// before paint, so a client-side visit to Home never flashes the wrong hero.
const useBeforePaint =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

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
 * The attribute is removed when Home unmounts. Why: docs/home-page.md.
 */
export function useReturningFlag() {
	const history = useToolHistory();
	const decided = useRef(false);

	useBeforePaint(() => {
		if (decided.current || history.phase === "idle") return;

		decided.current = true;

		const root = document.documentElement;

		if (history.returning) root.dataset.returning = "1";
		else delete root.dataset.returning;
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

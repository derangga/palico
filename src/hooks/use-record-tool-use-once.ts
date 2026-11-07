import { useEffect, useRef } from "react";

import { recordToolUse } from "#/lib/tool-history/store.ts";

/**
 * For a tool that shows its result live and has no button to press, like the
 * JWT decoder. Records the tool the first time `hasResult` is true in this
 * visit. A result that comes and goes while someone types counts once, so
 * storage is not written on every keystroke.
 */
export function useRecordToolUseOnce(path: string, hasResult: boolean) {
	const recorded = useRef(false);

	useEffect(() => {
		if (!hasResult || recorded.current) return;

		recorded.current = true;
		recordToolUse(path);
	}, [path, hasResult]);
}

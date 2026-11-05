import { useCallback, useEffect, useRef, useState } from "react";

/** A boolean that turns on when triggered and back off after `ms`. For "Copied" feedback. */
export function useFlash(ms: number) {
	const [on, setOn] = useState(false);
	const timer = useRef<number | undefined>(undefined);

	useEffect(() => () => window.clearTimeout(timer.current), []);

	const trigger = useCallback(() => {
		window.clearTimeout(timer.current);
		setOn(true);
		timer.current = window.setTimeout(() => setOn(false), ms);
	}, [ms]);

	return [on, trigger] as const;
}

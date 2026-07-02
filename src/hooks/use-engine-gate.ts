// Consent/load state machine for the ffmpeg.wasm engine gate, shared by the
// /video-converter and /video-cutter routes.
//
// On mount it peeks the Cache API: a cached engine skips the consent dialog
// and loads immediately; otherwise the route shows the consent flow. The
// dynamic import inside startLoad is the whole reason this gate exists — it
// keeps @ffmpeg/* out of the route bundle until the user opts in (palico-rpj
// contract).

import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";

import { isEngineCached, type LoadPhase } from "#/lib/video/cache.ts";

export function useEngineGate() {
	const [phase, setPhase] = useState<LoadPhase>({ kind: "checking" });
	const [declined, setDeclined] = useState(false);

	const startLoad = useCallback(async () => {
		setDeclined(false);
		setPhase({ kind: "downloading", percent: 0 });
		try {
			const { loadEngine } = await import("#/lib/video/engine.ts");
			await Effect.runPromise(loadEngine((next) => setPhase(next)));
		} catch (err) {
			setPhase({
				kind: "error",
				message:
					err instanceof Error
						? err.message
						: "Could not load the video engine.",
			});
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cached = await Effect.runPromise(isEngineCached);
			if (cancelled) return;
			if (cached) void startLoad();
			else setPhase({ kind: "consent" });
		})();
		return () => {
			cancelled = true;
		};
	}, [startLoad]);

	const decline = useCallback(() => setDeclined(true), []);

	return { phase, declined, startLoad, decline };
}

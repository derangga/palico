// Consent and load state for the qpdf engine, for any tool that needs it.
//
// On mount it peeks the Cache API: a saved engine is ready at once, otherwise the
// phase becomes "consent" and the tool shows the inline Enable card (the dialog
// opens only when the person clicks it). The engine is a 1.3 MB wasm that job
// workers read themselves, so "loading" is only the download and the save.

import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";

import { guardedEngineLoad } from "#/lib/offline/gate.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { isQpdfCached, type QpdfLoadPhase } from "#/lib/qpdf/assets.ts";
import { loadQpdfEngine } from "#/lib/qpdf/engine.ts";
import { m } from "#/paraglide/messages.js";

export function useQpdfGate() {
	const [phase, setPhase] = useState<QpdfLoadPhase>({ kind: "checking" });

	const startLoad = useCallback(async () => {
		setPhase({ kind: "downloading", percent: 0 });

		try {
			await offlineRuntime.runPromise(
				guardedEngineLoad("qpdf", loadQpdfEngine(setPhase)),
			);
		} catch (err) {
			setPhase({
				kind: "error",
				message:
					err instanceof Error ? err.message : m.error_qpdf_engine_load(),
			});
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			const cached = await Effect.runPromise(isQpdfCached);

			if (cancelled) return;

			if (cached) setPhase({ kind: "ready" });
			else setPhase({ kind: "consent" });
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	// A job that could not start the engine sends the person back to the card.
	const fail = useCallback(
		(message: string) => setPhase({ kind: "error", message }),
		[],
	);

	return { phase, startLoad, fail };
}

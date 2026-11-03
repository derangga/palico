import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";
import { EnginePanel } from "#/components/office-to-pdf/engine-panel.tsx";
import { OfficeShell } from "#/components/office-to-pdf/office-shell.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { isEngineCached, type LoadPhase } from "#/lib/file/office-types.ts";
import { guardedEngineLoad } from "#/lib/offline/gate.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";

export const Route = createFileRoute("/office-to-pdf")({
	component: OfficeToPdfPage,
});

// --- Engine gate (mirrors the video converter) ------------------------------

function OfficeToPdfPage() {
	const [phase, setPhase] = useState<LoadPhase>({ kind: "checking" });

	const startLoad = useCallback(async () => {
		setPhase({ kind: "downloading", percent: 0 });
		try {
			// Dynamic import keeps the office runtime out of the route bundle until
			// the user opts into the one-time engine download.
			const { loadEngine } = await import("#/lib/file/office-engine.ts");
			await offlineRuntime.runPromise(
				guardedEngineLoad(
					"office",
					loadEngine((next) => setPhase(next)),
				),
			);
		} catch (err) {
			setPhase({
				kind: "error",
				message:
					err instanceof Error
						? err.message
						: "Could not load the office engine.",
			});
		}
	}, []);

	// On mount: peek the Cache API. If the engine is already cached, skip the
	// consent step and go straight to preparing.
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

	return (
		<>
			{/* LibreOffice's Qt runtime requires this element to exist before the
			    engine boots (ZetaHelperMain reads #qtcanvas). Keep it mounted across
			    every phase, including the ready shell. Hidden — we convert headless. */}
			<canvas id="qtcanvas" className="hidden" />
			{phase.kind === "ready" ? (
				<OfficeShell />
			) : (
				<PageShell>
					<PageHeader title="Word to PDF">
						Convert Word, OpenDocument, and RTF files to PDF, entirely in your
						browser. Nothing is uploaded.
					</PageHeader>
					<EnginePanel phase={phase} onStart={startLoad} />
				</PageShell>
			)}
		</>
	);
}

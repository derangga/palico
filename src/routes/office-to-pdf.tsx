import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { useCallback, useEffect, useState } from "react";

import { EnginePanel } from "#/components/office-to-pdf/engine-panel.tsx";
import { OfficeShell } from "#/components/office-to-pdf/office-shell.tsx";
import { isEngineCached, type LoadPhase } from "#/lib/file/office-types.ts";

export const Route = createFileRoute("/office-to-pdf")({
	component: OfficeToPdfPage,
});

// --- Engine gate (mirrors the video converter) ------------------------------

function OfficeToPdfPage() {
	const [phase, setPhase] = useState<LoadPhase>({ kind: "checking" });
	const [declined, setDeclined] = useState(false);

	const startLoad = useCallback(async () => {
		setDeclined(false);
		setPhase({ kind: "downloading", percent: 0 });
		try {
			// Dynamic import keeps the office runtime out of the route bundle until
			// the user opts into the one-time engine download.
			const { loadEngine } = await import("#/lib/file/office-engine.ts");
			await Effect.runPromise(loadEngine((next) => setPhase(next)));
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
	// consent dialog and go straight to preparing.
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
				<div className="mx-auto w-full max-w-3xl px-6 py-10">
					<div className="mb-6">
						<h1 className="text-2xl font-bold">Word to PDF</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Convert Word, OpenDocument, and RTF files to PDF — entirely in
							your browser. Nothing is uploaded.
						</p>
					</div>
					<EnginePanel
						phase={phase}
						declined={declined}
						onStart={startLoad}
						onDecline={() => setDeclined(true)}
					/>
				</div>
			)}
		</>
	);
}

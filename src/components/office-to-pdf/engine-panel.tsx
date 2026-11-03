import { CircleAlert, FileText, Loader2 } from "lucide-react";

import {
	EngineCheckingSkeleton,
	EngineConsentCard,
} from "#/components/engine-consent-gate.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	type LoadPhase,
	OFFICE_ENGINE_SIZE_LABEL,
} from "#/lib/file/office-types.ts";

interface EnginePanelProps {
	phase: LoadPhase;
	onStart: () => void;
}

export function EnginePanel({ phase, onStart }: EnginePanelProps) {
	if (phase.kind === "error") {
		return (
			<div className="rounded-xl border border-destructive/30 bg-card p-6">
				<div className="flex items-start gap-3">
					<CircleAlert className="size-5 shrink-0 text-destructive" />
					<div className="flex-1">
						<p className="text-sm font-medium">Could not load the engine</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{phase.message}
						</p>
						<Button className="mt-4" onClick={onStart}>
							Try again
						</Button>
					</div>
				</div>
			</div>
		);
	}

	if (phase.kind === "checking") return <EngineCheckingSkeleton />;

	if (phase.kind === "consent") {
		return (
			<EngineConsentCard
				icon={FileText}
				title="Office conversion is disabled"
				body={`The ${OFFICE_ENGINE_SIZE_LABEL} engine download is required to use this tool.`}
				enableLabel="Enable office conversion"
				dialogTitle={`Download the office engine (${OFFICE_ENGINE_SIZE_LABEL})`}
				dialogDescription={
					<>
						Conversion runs entirely on your device using LibreOffice compiled
						to WebAssembly, a one-time {OFFICE_ENGINE_SIZE_LABEL} download. It
						is cached after the first load, so return visits are instant.
						Nothing leaves your browser.
					</>
				}
				onConfirm={onStart}
			/>
		);
	}

	// Loading phases: downloading → caching → preparing.
	const status =
		phase.kind === "downloading"
			? `Downloading engine ${phase.percent}%`
			: phase.kind === "caching"
				? "Caching engine"
				: "Preparing tools";
	const percent = phase.kind === "downloading" ? phase.percent : 100;

	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
				<p className="text-sm font-medium">{status}</p>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="progress-stripes h-full bg-cat-file transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				{phase.kind === "downloading"
					? "Fetching the engine. It will be cached for next time."
					: phase.kind === "caching"
						? "Saving the engine to your browser cache."
						: "Initializing LibreOffice (1–3s)."}
			</p>
		</div>
	);
}

import { CircleAlert, Download, FileText, Loader2 } from "lucide-react";

import { DownloadConsentDialog } from "#/components/download-consent-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	type LoadPhase,
	OFFICE_ENGINE_SIZE_LABEL,
} from "#/lib/file/office-types.ts";

interface EnginePanelProps {
	phase: LoadPhase;
	declined: boolean;
	onStart: () => void;
	onDecline: () => void;
}

export function EnginePanel({
	phase,
	declined,
	onStart,
	onDecline,
}: EnginePanelProps) {
	const dialogOpen = phase.kind === "consent" && !declined;

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

	if (phase.kind === "checking" || (phase.kind === "consent" && !declined)) {
		return (
			<>
				<EnginePlaceholder
					title="Preparing office tools"
					body="Checking for a cached engine…"
				/>
				<DownloadConsentDialog
					open={dialogOpen}
					onOpenChange={(open) => {
						if (!open) onDecline();
					}}
					onConfirm={onStart}
					icon={<FileText />}
					title={`Download the office engine (${OFFICE_ENGINE_SIZE_LABEL})`}
					description={
						<>
							Conversion runs entirely on your device using LibreOffice compiled
							to WebAssembly, a one-time {OFFICE_ENGINE_SIZE_LABEL} download. It
							is cached after the first load, so return visits are instant.
							Nothing leaves your browser.
						</>
					}
				/>
			</>
		);
	}

	if (phase.kind === "consent" && declined) {
		return (
			<div className="rounded-xl border border-dashed bg-card p-8 text-center">
				<FileText className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">
					Office conversion is disabled
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					The {OFFICE_ENGINE_SIZE_LABEL} engine download is required to use this
					tool.
				</p>
				<Button className="mt-4" onClick={onStart}>
					<Download />
					Enable office conversion
				</Button>
			</div>
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
					className="h-full bg-primary transition-[width] duration-150 ease-out"
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

function EnginePlaceholder({ title, body }: { title: string; body: string }) {
	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-muted-foreground" />
				<div>
					<p className="text-sm font-medium">{title}</p>
					<p className="mt-1 text-xs text-muted-foreground">{body}</p>
				</div>
			</div>
		</div>
	);
}

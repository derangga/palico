// Engine gate UI shared by /video-converter and /video-cutter: renders the
// error, checking (skeleton), consent (inline Enable card that opens the
// dialog on click), and loading states for the
// ffmpeg.wasm download negotiated by useEngineGate. Tool-specific copy (icon,
// consent body, declined panel strings) comes in as props.

import { Match } from "effect";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import {
	EngineCheckingSkeleton,
	EngineConsentCard,
} from "#/components/engine-consent-gate.tsx";
import { Button } from "#/components/ui/button.tsx";
import { ENGINE_SIZE_LABEL, type LoadPhase } from "#/lib/video/cache.ts";

interface VideoEnginePanelProps {
	phase: LoadPhase;
	onStart: () => void;
	icon: LucideIcon;
	consentDescription: ReactNode;
	disabledTitle: string;
	enableLabel: string;
}

export function VideoEnginePanel({
	phase,
	onStart,
	icon: Icon,
	consentDescription,
	disabledTitle,
	enableLabel,
}: VideoEnginePanelProps) {
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
				icon={Icon}
				title={disabledTitle}
				body={`The ${ENGINE_SIZE_LABEL} engine download is required to use this tool.`}
				enableLabel={enableLabel}
				dialogTitle={`Download the video engine (${ENGINE_SIZE_LABEL})`}
				dialogDescription={consentDescription}
				onConfirm={onStart}
			/>
		);
	}

	// Loading phases: downloading → caching → preparing.
	const { status, percent, detail } = Match.value(phase).pipe(
		Match.discriminators("kind")({
			downloading: ({ percent }) => ({
				status: `Downloading engine ${percent}%`,
				percent,
				detail: "Fetching the engine. It will be cached for next time.",
			}),
			caching: () => ({
				status: "Caching engine",
				percent: 100,
				detail: "Saving the engine to your browser cache.",
			}),
		}),
		Match.orElse(() => ({
			status: "Preparing tools",
			percent: 100,
			detail: "Initializing the engine in a worker thread (1–2s).",
		})),
	);

	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
				<p className="text-sm font-medium">{status}</p>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="progress-stripes h-full bg-cat-video transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}

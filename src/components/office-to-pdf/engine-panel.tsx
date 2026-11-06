import { Match } from "effect";
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
import { m } from "#/paraglide/messages.js";

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
						<p className="text-sm font-medium">
							{m.video_engine_error_title()}
						</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{phase.message}
						</p>
						<Button className="mt-4" onClick={onStart}>
							{m.common_try_again()}
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
				title={m.office_consent_title()}
				body={m.video_engine_consent_body({ size: OFFICE_ENGINE_SIZE_LABEL })}
				enableLabel={m.office_enable()}
				dialogTitle={m.office_dialog_title({ size: OFFICE_ENGINE_SIZE_LABEL })}
				dialogDescription={m.office_dialog_description({
					size: OFFICE_ENGINE_SIZE_LABEL,
				})}
				onConfirm={onStart}
			/>
		);
	}

	// Loading phases: downloading → caching → preparing.
	const { status, percent, detail } = Match.value(phase).pipe(
		Match.discriminators("kind")({
			downloading: ({ percent }) => ({
				status: m.video_engine_downloading({ percent }),
				percent,
				detail: m.video_engine_downloading_hint(),
			}),
			caching: () => ({
				status: m.video_engine_caching(),
				percent: 100,
				detail: m.video_engine_caching_hint(),
			}),
		}),
		Match.orElse(() => ({
			status: m.video_engine_preparing(),
			percent: 100,
			detail: m.office_preparing_hint(),
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
					className="progress-stripes h-full bg-cat-file transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">{detail}</p>
		</div>
	);
}

import { CircleAlert, Loader2, Lock } from "lucide-react";

import {
	EngineCheckingSkeleton,
	EngineConsentCard,
} from "#/components/engine-consent-gate.tsx";
import { Button } from "#/components/ui/button.tsx";
import { QPDF_SIZE_LABEL, type QpdfLoadPhase } from "#/lib/qpdf/assets.ts";
import { m } from "#/paraglide/messages.js";

// The qpdf engine's gate card: checking, the Enable card, download progress, or an
// error with Try again. Renders nothing once the engine is ready.
export function EnginePanel({
	phase,
	onStart,
}: {
	phase: QpdfLoadPhase;
	onStart: () => void;
}) {
	if (phase.kind === "ready") return null;

	if (phase.kind === "checking") return <EngineCheckingSkeleton />;

	if (phase.kind === "error") {
		return (
			<div
				role="alert"
				className="rounded-xl border border-destructive/30 bg-card p-6"
			>
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

	if (phase.kind === "consent") {
		return (
			<EngineConsentCard
				icon={Lock}
				title={m.pdfpw_consent_title()}
				body={m.video_engine_consent_body({ size: QPDF_SIZE_LABEL })}
				enableLabel={m.pdfpw_enable()}
				dialogTitle={m.pdfpw_dialog_title({ size: QPDF_SIZE_LABEL })}
				dialogDescription={m.pdfpw_dialog_description({
					size: QPDF_SIZE_LABEL,
				})}
				onConfirm={onStart}
			/>
		);
	}

	const caching = phase.kind === "caching";
	const percent = phase.kind === "downloading" ? phase.percent : 100;

	return (
		<div className="rounded-xl border bg-card p-6">
			<div className="flex items-center gap-3">
				<Loader2 className="size-5 shrink-0 animate-spin text-primary" />
				<p className="text-sm font-medium">
					{caching
						? m.video_engine_caching()
						: m.video_engine_downloading({ percent })}
				</p>
			</div>
			<div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="progress-stripes h-full bg-cat-file transition-[width] duration-150 ease-out"
					style={{ width: `${percent}%` }}
				/>
			</div>
			<p className="mt-3 text-xs text-muted-foreground">
				{caching
					? m.video_engine_caching_hint()
					: m.video_engine_downloading_hint()}
			</p>
		</div>
	);
}

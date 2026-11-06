import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const PILL: Record<OfflineStatus["_tag"], PillState> = {
	Ready: "done",
	Preparing: "working",
	NeedsDownload: "info",
	NotSaved: "warning",
	Unavailable: "queued",
};

export const OFFLINE_DOT: Record<OfflineStatus["_tag"], string> = {
	Ready: "bg-success",
	Preparing: "bg-muted-foreground",
	NeedsDownload: "bg-info",
	NotSaved: "bg-warning",
	Unavailable: "bg-muted-foreground",
};

export const offlineLabel = (status: OfflineStatus): string =>
	OfflineStatus.match(status, {
		Ready: () => m.offline_ready(),
		Preparing: () => m.offline_preparing(),
		NeedsDownload: ({ sizeLabel }) =>
			m.offline_needs_download({ size: sizeLabel }),
		NotSaved: () => m.offline_not_saved(),
		Unavailable: () => m.offline_unavailable(),
	});

/** Tool page header: the shared tinted status pill. */
export function OfflinePill({ status }: { status: OfflineStatus }) {
	return <StatusPill state={PILL[status._tag]} label={offlineLabel(status)} />;
}

/**
 * Home tiles and sidebar: a neutral label with a coloured dot, so the tile keeps
 * a single saturated colour (DESIGN.md). Only shown where the state can vary.
 */
export function OfflineDot({
	status,
	className,
	compact = false,
}: {
	status: OfflineStatus;
	className?: string;
	/** Dot only. The label stays for screen readers and as the tooltip. */
	compact?: boolean;
}) {
	return (
		<span
			title={compact ? offlineLabel(status) : undefined}
			className={cn(
				"inline-flex items-center gap-1.5 text-xs text-muted-foreground",
				className,
			)}
		>
			<span
				aria-hidden
				className={cn(
					"size-1.5 shrink-0 rounded-full",
					OFFLINE_DOT[status._tag],
				)}
			/>
			<span className={cn(compact && "sr-only")}>{offlineLabel(status)}</span>
		</span>
	);
}

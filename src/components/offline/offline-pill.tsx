import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import { cn } from "#/lib/utils.ts";

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
		Ready: () => "Works offline",
		Preparing: () => "Getting ready for offline",
		NeedsDownload: ({ sizeLabel }) => `Needs a ${sizeLabel} download`,
		NotSaved: () => "Not saved on this device",
		Unavailable: () => "Not available offline",
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
}: {
	status: OfflineStatus;
	className?: string;
}) {
	return (
		<span
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
			{offlineLabel(status)}
		</span>
	);
}

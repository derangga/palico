import { useState } from "react";

import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { shouldSwap } from "#/lib/offline/pill-swap.ts";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const PILL: Record<OfflineStatus["_tag"], PillState> = {
	// Neutral on purpose: sapphire (info) means "needs a download to work".
	Off: "queued",
	Ready: "done",
	Preparing: "working",
	NeedsDownload: "info",
	NotSaved: "warning",
	Unavailable: "queued",
};

export const OFFLINE_DOT: Record<OfflineStatus["_tag"], string> = {
	Off: "bg-muted-foreground",
	Ready: "bg-success",
	Preparing: "bg-muted-foreground",
	NeedsDownload: "bg-info",
	NotSaved: "bg-warning",
	Unavailable: "bg-muted-foreground",
};

export const offlineLabel = (status: OfflineStatus): string =>
	OfflineStatus.match(status, {
		Off: () => m.offline_off(),
		Ready: () => m.offline_ready(),
		Preparing: () => m.offline_preparing(),
		NeedsDownload: ({ sizeLabel }) =>
			m.offline_needs_download({ size: sizeLabel }),
		NotSaved: () => m.offline_not_saved(),
		Unavailable: () => m.offline_unavailable(),
	});

/**
 * Tool page header: the shared tinted status pill. When the person turns offline
 * on or off the new state fades in (see .offline-swap in styles.css). Page loads
 * never animate; shouldSwap says which changes count.
 */
export function OfflinePill({ status }: { status: OfflineStatus }) {
	const tag = status._tag;
	const [prev, setPrev] = useState(tag);
	const [sawOff, setSawOff] = useState(tag === "Off");
	const [swaps, setSwaps] = useState(0);

	if (prev !== tag) {
		setPrev(tag);

		if (shouldSwap(prev, tag, sawOff)) setSwaps((n) => n + 1);

		if (tag === "Off") setSawOff(true);
	}

	return (
		<span
			key={swaps}
			className={cn("inline-flex", swaps > 0 && "offline-swap")}
		>
			<StatusPill state={PILL[tag]} label={offlineLabel(status)} />
		</span>
	);
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
	// Off is not a state to read on a tile or a search row: it cannot be acted on
	// there, so show nothing rather than a dot that suggests it can.
	if (OfflineStatus.guards.Off(status)) return null;

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

import { CircleAlert, Loader2 } from "lucide-react";

import { DoneBurst, DrawCheck } from "#/components/done-burst.tsx";
import { cn } from "#/lib/utils.ts";

export type PillState =
	| "queued"
	| "working"
	| "done"
	| "failed"
	| "warning"
	| "info";

const STATES: Record<PillState, { label: string; tint: string; dot: string }> =
	{
		queued: {
			label: "Queued",
			tint: "bg-secondary",
			dot: "bg-muted-foreground",
		},
		working: { label: "Working", tint: "bg-primary/15", dot: "bg-primary" },
		done: { label: "Done", tint: "bg-success/20", dot: "bg-success" },
		failed: {
			label: "Failed",
			tint: "bg-destructive/15",
			dot: "bg-destructive",
		},
		warning: { label: "Warning", tint: "bg-warning/25", dot: "bg-warning" },
		info: { label: "Info", tint: "bg-info/20", dot: "bg-info" },
	};

/**
 * Tinted status pill. The label stays in the DOM at every width and is only
 * visually hidden below `sm`, where the icon or dot carries the state.
 * `celebrate` plays the check draw and dot burst once (see useJustDone).
 */
export function StatusPill({
	state,
	label,
	celebrate,
	className,
}: {
	readonly state: PillState;
	readonly label?: string;
	readonly celebrate?: boolean;
	readonly className?: string;
}) {
	const config = STATES[state];

	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center gap-1.5 rounded-full p-1.5 text-xs font-medium text-foreground sm:px-2.5 sm:py-1",
				config.tint,
				className,
			)}
		>
			{state === "working" ? (
				<Loader2
					aria-hidden
					className="size-3.5 shrink-0 animate-spin text-primary"
				/>
			) : state === "done" ? (
				<span className="relative inline-flex">
					<DrawCheck play={celebrate} className="size-3.5 text-success" />
					{celebrate && <DoneBurst />}
				</span>
			) : state === "failed" ? (
				<CircleAlert
					aria-hidden
					className="size-3.5 shrink-0 text-destructive"
				/>
			) : (
				<span
					aria-hidden
					className={cn("size-2 shrink-0 rounded-full", config.dot)}
				/>
			)}
			<span className="sr-only sm:not-sr-only">{label ?? config.label}</span>
		</span>
	);
}

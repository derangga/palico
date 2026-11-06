import type { ReactNode } from "react";

import { cn } from "#/lib/utils.ts";

export type Tone = "info" | "warning" | "success" | "danger" | "neutral";

// DESIGN.md status pills: a tint of the status colour, a coloured dot and a text
// label. Green is only ever a verified signature, red only a failed one.
const TONES: Record<Tone, { readonly chip: string; readonly dot: string }> = {
	info: { chip: "bg-info/15", dot: "bg-info" },
	warning: { chip: "bg-warning/20", dot: "bg-warning" },
	success: { chip: "bg-success/15", dot: "bg-success" },
	danger: { chip: "bg-destructive/10", dot: "bg-destructive" },
	neutral: { chip: "bg-muted", dot: "bg-muted-foreground" },
};

/** A status pill. It is an `output`, so a screen reader announces a change in it. */
export function StatusChip({
	tone,
	children,
}: {
	readonly tone: Tone;
	readonly children: ReactNode;
}) {
	return (
		<output
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-foreground transition-colors duration-150 ease-out",
				TONES[tone].chip,
			)}
		>
			<span
				aria-hidden
				className={cn("size-2 shrink-0 rounded-full", TONES[tone].dot)}
			/>
			{children}
		</output>
	);
}

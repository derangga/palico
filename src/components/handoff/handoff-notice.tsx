import { Link } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";

import type { HandoffState } from "#/hooks/use-handoff.ts";
import { CATEGORY_STYLES } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

/**
 * What a target page shows about a "Send to..." handoff, placed above its file
 * or dropzone: a "From Video cutter" chip that links back to the source tool, or
 * "Drop the file again" after a reload. `useHandoff` decides how long each lasts.
 */
export function HandoffNotice({
	handoff,
	className,
}: {
	readonly handoff: HandoffState;
	readonly className?: string;
}) {
	if (handoff.kind === "received") {
		const source = handoff.from;
		const Icon = source.icon;

		return (
			<div
				className={cn(
					"animate-pop-in mb-3 flex flex-wrap items-center gap-x-3 gap-y-1",
					className,
				)}
			>
				<Link
					to={source.to}
					title={m.handoff_back_to({ tool: source.label })}
					className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-1 pr-2.5 pl-1.5 text-xs font-semibold text-foreground transition-colors duration-150 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<span
						aria-hidden
						className={cn(
							"flex size-5 items-center justify-center rounded-full",
							CATEGORY_STYLES[source.category].chip,
						)}
					>
						<Icon className="size-3" />
					</span>
					{m.handoff_from({ tool: source.label })}
				</Link>
				{handoff.tookFirst && (
					<p className="text-xs text-muted-foreground">
						{m.handoff_first_only({ count: handoff.count })}
					</p>
				)}
			</div>
		);
	}

	if (handoff.kind === "missing") {
		return (
			<output
				className={cn(
					"animate-pop-in mb-3 flex items-start gap-3 rounded-lg bg-info/15 p-3 text-sm",
					className,
				)}
			>
				<RotateCcw aria-hidden className="mt-0.5 size-4 shrink-0" />
				<div>
					<p className="font-semibold">{m.handoff_missing_title()}</p>
					<p className="text-muted-foreground">{m.handoff_missing_body()}</p>
				</div>
			</output>
		);
	}

	return null;
}

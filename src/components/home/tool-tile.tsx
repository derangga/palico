import { Link } from "@tanstack/react-router";

import { OfflineDot } from "#/components/offline/offline-pill.tsx";
import { useOfflineStatus } from "#/hooks/use-offline-status.ts";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import { CATEGORY_STYLES, type Tool } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

// Motion lives in home.css (.tool-tile, .tool-chip), gated to hover-capable
// devices and switched to opacity and colour only for reduced motion.
export function ToolTile({ tool }: { tool: Tool }) {
	const style = CATEGORY_STYLES[tool.category];
	const offline = useOfflineStatus(tool.engine);

	return (
		<Link
			to={tool.to}
			className={cn(
				"tool-tile flex items-center gap-3 rounded-xl border border-border bg-card p-4 outline-none focus-visible:border-ring",
				style.vars,
			)}
		>
			<span
				className={cn(
					"tool-chip flex size-11 shrink-0 items-center justify-center rounded-lg",
					style.chip,
					style.ink,
				)}
			>
				<tool.icon className="size-5" aria-hidden />
			</span>
			<span className="grid min-w-0">
				<span className="text-sm font-bold text-foreground">{tool.label}</span>
				<span className="text-xs text-muted-foreground">{tool.blurb}</span>
				{tool.engine &&
					offline &&
					!OfflineStatus.guards.Unavailable(offline) && (
						<OfflineDot status={offline} className="mt-1" />
					)}
			</span>
		</Link>
	);
}

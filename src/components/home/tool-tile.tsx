import { Link } from "@tanstack/react-router";

import { CATEGORY_STYLES, type Tool } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

// Motion lives in home.css (.tool-tile, .tool-chip), gated to hover-capable
// devices and switched to opacity and colour only for reduced motion.
export function ToolTile({ tool }: { tool: Tool }) {
	const style = CATEGORY_STYLES[tool.category];
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
			</span>
		</Link>
	);
}

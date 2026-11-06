import { Link } from "@tanstack/react-router";

import { OfflineDot } from "#/components/offline/offline-pill.tsx";
import { ToolStar } from "#/components/tool-star.tsx";
import { useOfflineStatus } from "#/hooks/use-offline-status.ts";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import { CATEGORY_STYLES, type Tool } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

// Motion lives in home.css (.tool-tile, .tool-chip), gated to hover-capable
// devices and switched to opacity and colour only for reduced motion.
//
// The card is a div, not the link, because a button (the star) cannot sit inside
// an anchor. The link stretches over the whole card with ::after, and the star
// sits above it, so a click on the star never navigates.
//
// `compact` is the "Your tools" row: one line, no blurb, fixed height. The row
// reserves its height before hydration (see home.css), so the height is a
// constant here.
export function ToolTile({
	tool,
	compact = false,
	onStarToggle,
}: {
	tool: Tool;
	compact?: boolean;
	/** Called after the star is clicked, with whether the tool is now a favourite. */
	onStarToggle?: (nowFavourite: boolean) => void;
}) {
	const style = CATEGORY_STYLES[tool.category];
	const offline = useOfflineStatus(compact ? undefined : tool.engine);

	return (
		<div
			className={cn(
				"tool-tile relative flex items-center gap-1 rounded-xl border border-border bg-card has-[a:focus-visible]:border-ring",
				compact ? "h-14 pr-1 pl-3" : "py-4 pr-2 pl-4",
				style.vars,
			)}
		>
			<Link
				to={tool.to}
				className="flex min-w-0 flex-1 items-center gap-3 outline-none after:absolute after:inset-0 after:rounded-xl"
			>
				<span
					className={cn(
						"tool-chip flex shrink-0 items-center justify-center rounded-lg",
						compact ? "size-9" : "size-11",
						style.chip,
						style.ink,
					)}
				>
					<tool.icon className={compact ? "size-4" : "size-5"} aria-hidden />
				</span>
				<span className="grid min-w-0">
					<span
						className={cn(
							"text-sm font-bold text-foreground",
							compact && "truncate",
						)}
					>
						{tool.label}
					</span>
					{!compact && (
						<span className="text-xs text-muted-foreground">{tool.blurb}</span>
					)}
					{!compact &&
						tool.engine &&
						offline &&
						!OfflineStatus.guards.Unavailable(offline) && (
							<OfflineDot status={offline} className="mt-1" />
						)}
				</span>
			</Link>
			<ToolStar tool={tool} className="z-10" onToggle={onStarToggle} />
		</div>
	);
}

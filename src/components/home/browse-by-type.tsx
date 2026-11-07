import { ChevronDown } from "lucide-react";

import { ToolTile } from "#/components/home/tool-tile.tsx";
import { CATEGORY_STYLES, toolGroups } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

/**
 * Five category rows, closed, each a native `<details>` so the keyboard, find in
 * page and screen readers work with no script. The tool links are in the
 * prerendered HTML inside the closed rows, so crawlers and visitors without
 * JavaScript still reach every tool. The summary carries the `tools-<id>` id that
 * "Your tools" focuses when it disappears under the cursor. Why: docs/home-page.md.
 */
export function BrowseByType() {
	return (
		<section aria-labelledby="browse-by-type-title">
			<h2
				id="browse-by-type-title"
				className="mb-3 flex h-8 items-center text-sm font-semibold text-muted-foreground"
			>
				{m.home_browse_title()}
			</h2>
			{/* Two columns on wide screens; an open row takes only its own column. */}
			<div className="grid gap-2 lg:grid-cols-2 lg:items-start">
				{toolGroups.map((group) => (
					<details
						key={group.id}
						className="category-row rounded-xl border border-border"
					>
						<summary
							id={`tools-${group.id}`}
							className="flex min-h-13 w-full cursor-pointer list-none items-center gap-3 rounded-xl px-4 text-sm font-bold text-foreground outline-none [@media(hover:hover)]:hover:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
						>
							<span
								aria-hidden
								className={cn(
									"size-2.5 shrink-0 rounded-full",
									CATEGORY_STYLES[group.id].fill,
								)}
							/>
							{group.label}
							<span className="ml-auto text-xs font-semibold text-muted-foreground">
								{m.home_category_count({ count: group.tools.length })}
							</span>
							<ChevronDown
								aria-hidden
								className="category-chevron size-4 shrink-0 text-muted-foreground"
							/>
						</summary>
						{/* Two columns from sm; an odd last tile spans the row. */}
						<ul className="grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2">
							{group.tools.map((tool) => (
								<li key={tool.to} className="grid">
									<ToolTile tool={tool} />
								</li>
							))}
						</ul>
					</details>
				))}
			</div>
		</section>
	);
}

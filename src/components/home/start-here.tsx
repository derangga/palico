import { ToolTile } from "#/components/home/tool-tile.tsx";
import { startHereTools } from "#/lib/start-here.ts";
import { m } from "#/paraglide/messages.js";

/**
 * Four common jobs for a first-time visitor, as compact tiles with their stars.
 * It is in the prerendered page and home.css hides it with `html[data-returning]`
 * before first paint, so a visitor with history never sees it flash. Why:
 * docs/home-page.md. The heading is `tabIndex={-1}` so your-tools.tsx can move focus
 * to it when the row empties.
 */
export function StartHere() {
	return (
		<section
			aria-labelledby="start-here-title"
			className="start-here mb-8 lg:mb-10"
		>
			<h2
				id="start-here-title"
				tabIndex={-1}
				className="mb-3 flex h-8 items-center text-sm font-semibold text-muted-foreground outline-none"
			>
				{m.home_start_here()}
			</h2>
			<ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{startHereTools().map((tool) => (
					<li key={tool.to} className="grid">
						<ToolTile tool={tool} compact />
					</li>
				))}
			</ul>
		</section>
	);
}

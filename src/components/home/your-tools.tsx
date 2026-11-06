import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useJustDone } from "#/components/done-burst.tsx";
import { ToolTile } from "#/components/home/tool-tile.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useToolHistory } from "#/hooks/use-tool-history.ts";
import { TOOLS, toolGroups } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const TOOL_BY_PATH = new Map(TOOLS.map((tool) => [tool.to, tool]));

// How long a spoken message stays in the live region.
const ANNOUNCE_MS = 4000;

// Where focus goes after a click removes what was focused. Set in the click
// handler, used by the effect once the list has changed.
type Handoff =
	| { readonly at: number; readonly target: "heading" }
	| { readonly at: number; readonly target: "star"; readonly index: number };

/**
 * Starred tools, then recently used ones, above the category groups. Nothing is
 * rendered for a first-time visitor or when storage is blocked. The slot around
 * it is always in the page; home.css reserves its height from a pre-paint script
 * (see tool-history/prepaint.ts), so the groups do not jump when it fills in.
 * Layout and why: docs/recent-tools.md.
 */
export function YourTools() {
	const history = useToolHistory();
	const headingRef = useRef<HTMLHeadingElement>(null);
	const listRef = useRef<HTMLUListElement>(null);
	const handoff = useRef<Handoff | null>(null);
	const [announcement, setAnnouncement] = useState("");

	const tools = history.paths.flatMap((path) => {
		const tool = TOOL_BY_PATH.get(path);

		return tool ? [tool] : [];
	});

	const filled = tools.length > 0;
	const listKey = tools.map((tool) => tool.to).join("|");

	// True once the row has gone from empty to filled in this mount: after
	// hydration, or when the first star is added. Opening Home with the history
	// already loaded does not replay it.
	const entering = useJustDone(filled);

	// True while the slot grows open. Only for the in-session case: the history was
	// already read and empty, then the first star arrived. After hydration the
	// height is reserved already, so nothing grows.
	const [growing, setGrowing] = useState(false);
	const [prev, setPrev] = useState({ filled, phase: history.phase });

	if (prev.filled !== filled || prev.phase !== history.phase) {
		setPrev({ filled, phase: history.phase });

		if (!filled) setGrowing(false);

		if (filled && !prev.filled && prev.phase === "ready") setGrowing(true);
	}

	// Once the history has been read, the row sizes itself and the reserved
	// height from the pre-paint script is not needed any more.
	useEffect(() => {
		if (history.phase !== "idle") {
			delete document.documentElement.dataset.yourTools;
		}
	}, [history.phase]);

	// A click that removes the focused tile or button leaves focus on <body>.
	// Once the list has changed, put it somewhere useful: the next star, the row
	// heading, or the first category heading when the row is gone.
	useEffect(() => {
		const pending = handoff.current;

		handoff.current = null;

		// A stale request, such as one left by a click that changed nothing, must
		// not steal focus from a later change.
		if (!pending || Date.now() - pending.at > 1000) return;

		const firstGroup = document.getElementById(`tools-${toolGroups[0].id}`);

		if (!filled) {
			firstGroup?.focus();

			return;
		}

		if (pending.target === "star") {
			const stars =
				listRef.current?.querySelectorAll<HTMLElement>("button.tool-star");

			const next = stars?.[Math.min(pending.index, stars.length - 1)];

			if (next) {
				next.focus();

				return;
			}
		}

		headingRef.current?.focus();
	}, [listKey, filled]);

	// A spoken message clears itself, so the next one is a change again.
	useEffect(() => {
		if (announcement === "") return;

		const timer = window.setTimeout(() => setAnnouncement(""), ANNOUNCE_MS);

		return () => window.clearTimeout(timer);
	}, [announcement]);

	function clearRecent() {
		handoff.current = { at: Date.now(), target: "heading" };
		setAnnouncement(m.your_tools_cleared());
		history.clearRecent();
	}

	return (
		<div
			className={cn(
				"your-tools-slot",
				filled && "is-filled",
				filled && growing && "is-growing",
			)}
			onAnimationEnd={(event) => {
				// Animations inside the row bubble up too. Only the slot's own counts.
				if (event.animationName === "your-tools-grow") setGrowing(false);
			}}
		>
			{filled && (
				<section
					aria-labelledby="your-tools-title"
					className={cn(entering && "your-tools-in")}
				>
					<div className="mb-3 flex h-8 items-center justify-between gap-2">
						<h2
							id="your-tools-title"
							ref={headingRef}
							tabIndex={-1}
							className="flex items-center gap-2 text-sm font-semibold text-muted-foreground outline-none"
						>
							<Star aria-hidden className="size-3.5 fill-current" />
							{m.your_tools_title()}
						</h2>
						{history.hasRecent && (
							<Button
								variant="ghost"
								size="sm"
								className="-mr-2 text-muted-foreground"
								onClick={clearRecent}
							>
								{m.your_tools_clear()}
							</Button>
						)}
					</div>
					<ul ref={listRef} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{tools.map((tool, index) => (
							<li key={tool.to} className="grid">
								<ToolTile
									tool={tool}
									compact
									onStarToggle={(nowFavourite) => {
										if (nowFavourite) return;

										handoff.current = { at: Date.now(), target: "star", index };
										setAnnouncement(m.your_tools_removed({ tool: tool.label }));
									}}
								/>
							</li>
						))}
					</ul>
					<p className="mt-3 text-xs leading-4 text-muted-foreground">
						{m.your_tools_note()}
					</p>
				</section>
			)}
			{/* Always in the page, so a screen reader hears the text when it changes. */}
			<output className="sr-only">{announcement}</output>
		</div>
	);
}

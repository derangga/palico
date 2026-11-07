import { Clock, Star } from "lucide-react";
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
// handler, used by the effect once the lists have changed.
type Handoff =
	// After Clear: the Favourites heading, else the next heading in the row.
	| { readonly at: number; readonly target: "heading" }
	// After unstarring in Favourites: the star now at that position.
	| { readonly at: number; readonly target: "star"; readonly index: number }
	// After starring in Recently used: the same tool, now in Favourites.
	| { readonly at: number; readonly target: "tool"; readonly path: string };

const toolsOf = (paths: ReadonlyArray<string>) =>
	paths.flatMap((path) => {
		const tool = TOOL_BY_PATH.get(path);

		return tool ? [tool] : [];
	});

/**
 * Two sections above the category rows: Favourites (starred tools, in the order
 * they were starred) and Recently used (up to six, with Clear). Nothing is
 * rendered for a first-time visitor or when storage is blocked. The slot around
 * it is always in the page; home.css reserves its height from a pre-paint script
 * (see tool-history/prepaint.ts), so what is below does not jump when it fills
 * in. Layout and why: docs/recent-tools.md.
 */
export function YourTools() {
	const history = useToolHistory();
	const favouritesHeadingRef = useRef<HTMLHeadingElement>(null);
	const recentHeadingRef = useRef<HTMLHeadingElement>(null);
	const favouritesListRef = useRef<HTMLUListElement>(null);
	const handoff = useRef<Handoff | null>(null);
	const [announcement, setAnnouncement] = useState("");

	const favourites = toolsOf(history.favouritePaths);
	const recent = toolsOf(history.recentPaths);

	const filled = favourites.length + recent.length > 0;

	// Recent tools but no favourites: Favourites holds one dashed hint tile.
	const showHint = favourites.length === 0 && recent.length > 0;

	// The two lists are separate in the key: a tool that moves from one to the
	// other keeps the same flat order but must still count as a change.
	const listKey = `${favourites.map((tool) => tool.to).join("|")}||${recent
		.map((tool) => tool.to)
		.join("|")}`;

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
	// Once the lists have changed, put it somewhere useful: the next star, the
	// tool where it moved, a heading, or the first category row when the row is
	// gone.
	useEffect(() => {
		const pending = handoff.current;

		handoff.current = null;

		// A stale request, such as one left by a click that changed nothing, must
		// not steal focus from a later change.
		if (!pending || Date.now() - pending.at > 1000) return;

		if (!filled) {
			document.getElementById(`tools-${toolGroups[0].id}`)?.focus();

			return;
		}

		if (pending.target === "tool") {
			const item = [
				...(favouritesListRef.current?.querySelectorAll<HTMLElement>(
					"li[data-tool]",
				) ?? []),
			].find((li) => li.dataset.tool === pending.path);

			const star = item?.querySelector<HTMLElement>("button.tool-star");

			if (star) {
				star.focus();

				return;
			}
		}

		if (pending.target === "star") {
			const stars =
				favouritesListRef.current?.querySelectorAll<HTMLElement>(
					"button.tool-star",
				);

			const next = stars?.[Math.min(pending.index, stars.length - 1)];

			if (next) {
				next.focus();

				return;
			}
		}

		(favouritesHeadingRef.current ?? recentHeadingRef.current)?.focus();
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
				<div
					className={cn(
						"your-tools-row [&>section+section]:mt-6",
						entering && "your-tools-in",
					)}
				>
					{/* Shown whenever the row is: favourites, or the hint above recent tools. */}
					<section aria-labelledby="your-tools-favourites-title">
						<div className="mb-3 flex h-8 items-center justify-between gap-2">
							<h2
								id="your-tools-favourites-title"
								ref={favouritesHeadingRef}
								tabIndex={-1}
								className="flex items-center gap-2 text-sm font-semibold text-muted-foreground outline-none"
							>
								<Star aria-hidden className="size-3.5 fill-current" />
								{m.your_tools_favourites()}
								<span className="font-normal tabular-nums">
									{favourites.length}
								</span>
							</h2>
						</div>
						<ul
							ref={favouritesListRef}
							className="grid grid-cols-2 gap-3 sm:grid-cols-3"
						>
							{showHint && (
								// Not a link or a button: it only says what the star does.
								<li className="col-span-full">
									<div className="flex h-14 items-center gap-3 rounded-xl border-[1.5px] border-dashed border-border px-4 text-sm text-muted-foreground">
										<Star aria-hidden className="size-4 shrink-0" />
										{m.your_tools_favourites_hint()}
									</div>
								</li>
							)}
							{favourites.map((tool, index) => (
								<li key={tool.to} data-tool={tool.to} className="grid">
									<ToolTile
										tool={tool}
										compact
										onStarToggle={(nowFavourite) => {
											if (nowFavourite) return;

											handoff.current = {
												at: Date.now(),
												target: "star",
												index,
											};
											setAnnouncement(
												m.your_tools_removed({ tool: tool.label }),
											);
										}}
									/>
								</li>
							))}
						</ul>
					</section>
					{recent.length > 0 && (
						<section aria-labelledby="your-tools-recent-title">
							<div className="mb-3 flex h-8 items-center justify-between gap-2">
								<h2
									id="your-tools-recent-title"
									ref={recentHeadingRef}
									tabIndex={-1}
									className="flex items-center gap-2 text-sm font-semibold text-muted-foreground outline-none"
								>
									<Clock aria-hidden className="size-3.5" />
									{m.your_tools_recent()}
									<span className="font-normal tabular-nums">
										{recent.length}
									</span>
								</h2>
								<Button
									variant="ghost"
									size="sm"
									className="-mr-2 text-muted-foreground"
									onClick={clearRecent}
								>
									{m.your_tools_clear()}
								</Button>
							</div>
							<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
								{recent.map((tool) => (
									<li key={tool.to} data-tool={tool.to} className="grid">
										<ToolTile
											tool={tool}
											compact
											onStarToggle={(nowFavourite) => {
												// The tile moves into Favourites, so this star unmounts.
												if (!nowFavourite) return;

												handoff.current = {
													at: Date.now(),
													target: "tool",
													path: tool.to,
												};
											}}
										/>
									</li>
								))}
							</ul>
						</section>
					)}
					<p className="mt-3 text-xs leading-4 text-muted-foreground">
						{m.your_tools_note()}
					</p>
				</div>
			)}
			{/* Always in the page, so a screen reader hears the text when it changes. */}
			<output className="sr-only">{announcement}</output>
		</div>
	);
}

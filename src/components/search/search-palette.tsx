import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";

import { OfflineDot } from "#/components/offline/offline-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import { useKeyboardInset } from "#/hooks/use-keyboard-inset.ts";
import { useOfflineStatus } from "#/hooks/use-offline-status.ts";
import { OfflineStatus } from "#/lib/offline/shapes.ts";
import {
	CATEGORY_STYLES,
	type Tool,
	type ToolCategory,
	toolGroups,
} from "#/lib/tool-categories.ts";
import { searchTools } from "#/lib/tool-search.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

type Section = {
	value: string;
	category?: ToolCategory;
	items: Tool[];
};

function ToolRow({
	tool,
	onSelect,
}: {
	tool: Tool;
	onSelect: (tool: Tool) => void;
}) {
	const style = CATEGORY_STYLES[tool.category];
	const offline = useOfflineStatus(tool.engine);

	return (
		// Item onClick also fires on Enter for the highlighted row.
		<Autocomplete.Item
			value={tool}
			onClick={() => onSelect(tool)}
			className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 outline-none data-highlighted:bg-accent"
		>
			<span
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded-md",
					style.chip,
					style.ink,
				)}
			>
				<tool.icon className="size-4" aria-hidden />
			</span>
			<span className="grid min-w-0 flex-1">
				<span className="text-sm font-semibold text-foreground">
					{tool.label}
				</span>
				<span className="truncate text-xs text-muted-foreground">
					{tool.blurb}
				</span>
			</span>
			{tool.engine && offline && !OfflineStatus.guards.Unavailable(offline) && (
				<OfflineDot status={offline} compact />
			)}
		</Autocomplete.Item>
	);
}

/**
 * Cmd/Ctrl+K tool search. `searchTools` decides the order, so the Autocomplete
 * gets `filter={null}`. See docs/search.md.
 */
export function SearchPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [query, setQuery] = useState("");
	const navigate = useNavigate();
	const results = searchTools(query);
	const searching = query.trim() !== "";
	const keyboard = useKeyboardInset(open);

	// Fires inside text fields too, like Cmd/Ctrl+B for the sidebar.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			// The K key by its letter, or by its position when the layout has no
			// Latin K (Russian, Greek). A Latin layout like Dvorak keeps its letter.
			const isK =
				event.key.toLowerCase() === "k" ||
				(event.code === "KeyK" && !/^[a-z]$/i.test(event.key));

			if (
				isK &&
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				!event.shiftKey
			) {
				event.preventDefault();

				// Holding the keys down must not flicker the palette open and shut.
				if (event.repeat) return;

				// Do not stack on another modal (the mobile sidebar sheet, the
				// download consent dialog). Closing our own palette is always fine.
				if (
					!open &&
					document.querySelector('[role="dialog"], [role="alertdialog"]')
				)
					return;

				onOpenChange(!open);
			}
		};

		window.addEventListener("keydown", onKey);

		return () => window.removeEventListener("keydown", onKey);
	}, [open, onOpenChange]);

	const select = (tool: Tool) => {
		onOpenChange(false);
		void navigate({ to: tool.to });
	};

	// One shape for both views: category groups when empty, one unlabeled
	// ranked group while searching. No group at all when nothing matches.
	const sections: Section[] = !searching
		? toolGroups.map((group) => ({
				value: group.label,
				category: group.id,
				items: group.tools,
			}))
		: results.length > 0
			? [{ value: m.search_results_group(), items: [...results] }]
			: [];

	// Always mounted, so screen readers announce the text when it changes.
	const status = !searching
		? ""
		: results.length > 0
			? results.length === 1
				? m.search_found_one({ count: results.length })
				: m.search_found_other({ count: results.length })
			: m.search_none({ query: query.trim() });

	// SAFETY: React types style by known property names only. --kb-bottom,
	// --kb-height and --kb-pad are custom properties that the max-md: classes on
	// the popup read through var(). They have no effect from md up.
	const sheetStyle = {
		"--kb-bottom": `${keyboard?.bottom ?? 0}px`,
		"--kb-height": keyboard ? `${keyboard.height}px` : "100dvh",
		"--kb-pad": keyboard?.bottom ? "0px" : "env(safe-area-inset-bottom)",
	} as CSSProperties;

	return (
		<Dialog.Root
			open={open}
			onOpenChange={onOpenChange}
			// Clear once it has closed, so the list does not jump while closing.
			onOpenChangeComplete={(isOpen) => {
				if (!isOpen) setQuery("");
			}}
		>
			<Dialog.Portal>
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 supports-backdrop-filter:backdrop-blur-xs max-md:transition-opacity max-md:duration-150 max-md:ease-out max-md:data-ending-style:opacity-0 max-md:data-starting-style:opacity-0 dark:bg-ctp-crust/60" />
				<Dialog.Popup
					style={sheetStyle}
					className={cn(
						"fixed z-50 flex flex-col overflow-hidden bg-popover text-popover-foreground shadow-xl outline-none",
						// Desktop: centered card, no animation (Cmd/Ctrl+K is a keyboard action).
						"md:top-[12dvh] md:left-1/2 md:max-h-[76dvh] md:w-[calc(100%-2rem)] md:max-w-lg md:-translate-x-1/2 md:rounded-xl md:ring-1 md:ring-border",
						// Mobile: bottom sheet. Opens in 220ms, closes faster.
						"max-md:inset-x-0 max-md:bottom-(--kb-bottom) max-md:max-h-[min(85dvh,calc(var(--kb-height)-1rem))] max-md:rounded-t-2xl max-md:border-t max-md:border-border max-md:pb-(--kb-pad)",
						"max-md:transition-[translate,opacity] max-md:duration-[220ms] max-md:ease-drawer max-md:data-ending-style:duration-150 max-md:data-ending-style:ease-out",
						"max-md:motion-safe:data-ending-style:translate-y-full max-md:motion-safe:data-starting-style:translate-y-full",
						"max-md:motion-reduce:data-ending-style:opacity-0 max-md:motion-reduce:data-starting-style:opacity-0",
					)}
				>
					<Dialog.Title className="sr-only">
						{m.search_button_label()}
					</Dialog.Title>
					<Autocomplete.Root
						inline
						open
						autoHighlight
						items={sections}
						// searchTools already filtered and ranked, so the library must not.
						filter={null}
						value={query}
						onValueChange={setQuery}
					>
						<div className="flex items-center gap-1 border-b border-border p-2">
							<div className="relative min-w-0 flex-1">
								<SearchIcon
									className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
									aria-hidden
								/>
								<Autocomplete.Input
									aria-label={m.search_button_label()}
									placeholder={m.search_placeholder()}
									// Same field as ui/input.tsx, so the focus ring is the standard one.
									className="h-10 w-full min-w-0 rounded-md border border-input bg-background pr-3 pl-9 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
								/>
							</div>
							{/* A sheet needs a visible way out. Swipe is not one. */}
							<Dialog.Close
								render={
									<Button variant="ghost" className="size-11 md:hidden" />
								}
							>
								<XIcon className="size-5" aria-hidden />
								<span className="sr-only">{m.sheet_close()}</span>
							</Dialog.Close>
						</div>
						<Autocomplete.List className="min-h-0 flex-1 overflow-y-auto p-2">
							{(section: Section) => (
								<Autocomplete.Group key={section.value} items={section.items}>
									{/* The ranked results group keeps a label for screen readers only. */}
									<Autocomplete.GroupLabel
										className={
											section.category
												? "flex items-center gap-2 px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
												: "sr-only"
										}
									>
										{section.category && (
											<span
												aria-hidden
												className={cn(
													"size-2 rounded-full",
													CATEGORY_STYLES[section.category].fill,
												)}
											/>
										)}
										{section.value}
									</Autocomplete.GroupLabel>
									<Autocomplete.Collection>
										{(tool: Tool) => (
											<ToolRow key={tool.to} tool={tool} onSelect={select} />
										)}
									</Autocomplete.Collection>
								</Autocomplete.Group>
							)}
						</Autocomplete.List>
					</Autocomplete.Root>
					<output
						className={cn(
							results.length === 0 && searching
								? "block px-4 py-3 text-sm text-muted-foreground"
								: "sr-only",
						)}
					>
						{status}
					</output>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

import { Autocomplete } from "@base-ui/react/autocomplete";
import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { OfflineDot } from "#/components/offline/offline-pill.tsx";
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
				<OfflineDot status={offline} className="max-sm:hidden" />
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
			? [{ value: "Results", items: [...results] }]
			: [];

	// Always mounted, so screen readers announce the text when it changes.
	const status = !searching
		? ""
		: results.length > 0
			? `${results.length} ${results.length === 1 ? "tool" : "tools"} found`
			: `No tool matches "${query.trim()}". Try a format, like gif or pdf.`;

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
				<Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/25 supports-backdrop-filter:backdrop-blur-xs dark:bg-ctp-crust/60" />
				<Dialog.Popup className="fixed top-[12dvh] left-1/2 z-50 flex max-h-[76dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 flex-col overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-xl ring-1 ring-border outline-none">
					<Dialog.Title className="sr-only">Search tools</Dialog.Title>
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
						<div className="flex items-center gap-2 border-b border-border px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-inset focus-within:ring-ring/50">
							<SearchIcon
								className="size-4 shrink-0 text-muted-foreground"
								aria-hidden
							/>
							<Autocomplete.Input
								aria-label="Search tools"
								placeholder="Search tools, like gif or pdf"
								className="h-12 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
							/>
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

import { Star } from "lucide-react";
import { useState } from "react";

import "#/components/tool-star.css";
import { useToolHistory } from "#/hooks/use-tool-history.ts";
import { CATEGORY_STYLES, type Tool } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

/**
 * The favourite toggle on a home tile and in a tool page header. A real
 * `button` with `aria-pressed`, so it is never inside a link: the tile keeps
 * its own link and puts this above it. When storage is blocked it is
 * `aria-disabled` with a no-op click, not `disabled`, so Tab still reaches it
 * and the label can say why it does nothing.
 */
export function ToolStar({
	tool,
	className,
	onToggle,
}: {
	tool: Tool;
	className?: string;
	/** Called after a click with whether the tool is now a favourite. */
	onToggle?: (nowFavourite: boolean) => void;
}) {
	const history = useToolHistory();
	const [pop, setPop] = useState(false);

	const pressed = history.isFavourite(tool.to);
	const unavailable = history.phase === "unavailable";

	return (
		<button
			type="button"
			aria-pressed={pressed}
			aria-label={
				unavailable
					? m.favourite_unavailable({ tool: tool.label })
					: m.favourite_toggle({ tool: tool.label })
			}
			aria-disabled={unavailable}
			onClick={(event) => {
				if (unavailable) return;

				// detail is 0 for a keyboard click. Keyboard actions do not animate.
				if (!pressed && event.detail > 0) setPop(true);

				history.toggleFavourite(tool.to);
				onToggle?.(!pressed);
			}}
			className={cn(
				"tool-star relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none pointer-coarse:size-11",
				"focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
				!unavailable && "hover:bg-secondary",
				pressed
					? CATEGORY_STYLES[tool.category].ink
					: !unavailable && "hover:text-foreground",
				className,
			)}
		>
			<Star
				aria-hidden
				onAnimationEnd={() => setPop(false)}
				className={cn(
					"tool-star-icon size-[1.125rem]",
					pressed && "fill-current",
					pop && "tool-star-pop",
				)}
			/>
		</button>
	);
}

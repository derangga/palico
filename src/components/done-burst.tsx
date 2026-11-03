import { useEffect, useRef, useState } from "react";

import { cn } from "#/lib/utils.ts";

/**
 * True for the render after `isDone` flips from false to true. Rows that are
 * already done on first render never celebrate, and re-renders do not replay it.
 */
export function useJustDone(isDone: boolean): boolean {
	const wasDone = useRef(isDone);
	const [just, setJust] = useState(false);
	useEffect(() => {
		if (isDone && !wasDone.current) setJust(true);
		wasDone.current = isDone;
	}, [isDone]);
	return just;
}

// Written out as literals so Tailwind sees every class.
const DOT_COLOURS = [
	"bg-ctp-mauve",
	"bg-ctp-pink",
	"bg-ctp-peach",
	"bg-ctp-yellow",
	"bg-ctp-green",
	"bg-ctp-teal",
	"bg-ctp-sky",
	"bg-ctp-blue",
	"bg-ctp-lavender",
	"bg-ctp-red",
	"bg-ctp-sapphire",
	"bg-ctp-flamingo",
] as const;

const DOTS = DOT_COLOURS.map((colour, i) => {
	const angle = (i / DOT_COLOURS.length) * Math.PI * 2;
	// Alternate the reach so the ring reads as a burst, not a circle.
	const reach = i % 2 === 0 ? 22 : 15;
	return {
		colour,
		dx: `${(Math.cos(angle) * reach).toFixed(1)}px`,
		dy: `${(Math.sin(angle) * reach).toFixed(1)}px`,
	};
});

const BURST_MS = 450;

/** Burst of dots from the centre of its nearest positioned parent. Removes itself. */
export function DoneBurst() {
	const [visible, setVisible] = useState(true);
	useEffect(() => {
		const id = window.setTimeout(() => setVisible(false), BURST_MS);
		return () => window.clearTimeout(id);
	}, []);
	if (!visible) return null;

	return (
		<span
			aria-hidden
			className="done-burst pointer-events-none absolute top-1/2 left-1/2 size-0"
		>
			{DOTS.map((dot) => (
				<span
					key={dot.colour}
					className={cn(
						"done-burst-dot absolute -top-[3px] -left-[3px] size-1.5 rounded-full",
						dot.colour,
					)}
					style={{ "--dx": dot.dx, "--dy": dot.dy } as React.CSSProperties}
				/>
			))}
		</span>
	);
}

/** Check mark that draws itself when `play` is set; static otherwise. */
export function DrawCheck({
	play,
	className,
}: {
	readonly play?: boolean;
	readonly className?: string;
}) {
	return (
		<svg
			aria-hidden
			role="presentation"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={3}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={cn("draw-check size-4 shrink-0", className)}
			data-play={play || undefined}
		>
			<path d="M20 6 9 17l-5-5" pathLength={1} />
		</svg>
	);
}

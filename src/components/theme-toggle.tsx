import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { Button } from "#/components/ui/button.tsx";

const REVEAL_MS = 350;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

export function ThemeToggle() {
	const { resolvedTheme, setTheme } = useTheme();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const revealing = useRef(false);
	// resolvedTheme is unknown on the server, so the label waits for mount to
	// avoid a hydration mismatch. The icons swap with the `dark:` variant, which
	// is correct from first paint.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	const isDark = resolvedTheme === "dark";
	const label = !mounted
		? "Switch theme"
		: isDark
			? "Switch to light theme"
			: "Switch to dark theme";

	// Circular reveal from the button via the View Transitions API. Instant when
	// the API is missing or reduced motion is set; ignored while one is running.
	const toggle = () => {
		const next = isDark ? "light" : "dark";
		const button = buttonRef.current;
		const reduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (revealing.current) return;
		if (!button || reduced || !document.startViewTransition) {
			setTheme(next);
			return;
		}

		const rect = button.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		const radius = Math.hypot(
			Math.max(x, window.innerWidth - x),
			Math.max(y, window.innerHeight - y),
		);
		const root = document.documentElement;

		revealing.current = true;
		root.classList.add("theme-switching");
		const transition = document.startViewTransition(() => {
			flushSync(() => setTheme(next));
		});
		transition.ready.then(
			() =>
				root.animate(
					{
						clipPath: [
							`circle(0px at ${x}px ${y}px)`,
							`circle(${radius}px at ${x}px ${y}px)`,
						],
					},
					{
						duration: REVEAL_MS,
						easing: EASE_OUT,
						pseudoElement: "::view-transition-new(root)",
					},
				),
			// ready rejects when the transition is skipped; the theme is applied anyway.
			() => undefined,
		);
		transition.finished.finally(() => {
			revealing.current = false;
			root.classList.remove("theme-switching");
		});
	};

	return (
		<Button
			ref={buttonRef}
			variant="ghost"
			size="icon"
			className="relative ml-auto"
			aria-label={label}
			title={label}
			onClick={toggle}
		>
			<Moon
				data-theme-icon
				className="transition-[transform,opacity] duration-150 ease-out dark:-rotate-90 dark:scale-50 dark:opacity-0"
				aria-hidden
			/>
			<Sun
				data-theme-icon
				className="absolute rotate-90 scale-50 opacity-0 transition-[transform,opacity] duration-150 ease-out dark:rotate-0 dark:scale-100 dark:opacity-100"
				aria-hidden
			/>
		</Button>
	);
}

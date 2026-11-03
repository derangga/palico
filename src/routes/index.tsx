import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import "#/components/home/home.css";
import { ToolTile } from "#/components/home/tool-tile.tsx";
import { buttonVariants } from "#/components/ui/button.tsx";
import { seoHead } from "#/lib/seo.ts";
import { CATEGORY_STYLES, toolGroups } from "#/lib/tool-categories.ts";
import { cn } from "#/lib/utils.ts";

const SEEN_KEY = "palico-home-seen";

// Runs before first paint so a reload in the same session skips the stagger.
// Storage can be blocked, in which case the stagger simply plays again.
const SEEN_SCRIPT = `try{if(sessionStorage.getItem("${SEEN_KEY}"))document.documentElement.dataset.homeSeen="1"}catch(e){}`;

export const Route = createFileRoute("/")({
	head: () => {
		const seo = seoHead("/");

		return {
			...seo,
			scripts: [...seo.scripts, { children: SEEN_SCRIPT }],
		};
	},
	component: Home,
});

// Marks the stagger as played once it has run, so going back to Home in the
// same session shows the grid at once.
function useMarkHomeSeen() {
	useEffect(() => {
		const markSeen = () => {
			document.documentElement.dataset.homeSeen = "1";

			try {
				sessionStorage.setItem(SEEN_KEY, "1");
			} catch {
				// Storage blocked: the attribute above still covers this tab.
			}
		};

		const start = Date.now();
		const timer = window.setTimeout(markSeen, 1000);

		return () => {
			window.clearTimeout(timer);

			// Leaving after the stagger had a real look counts as seen. The quick
			// cleanup React Strict Mode runs in dev does not.
			if (Date.now() - start > 300) markSeen();
		};
	}, []);
}

// Each tile's position across all groups, for the staggered entrance.
const TILE_INDEX = new Map(
	toolGroups.flatMap((group) => group.tools).map((tool, i) => [tool.to, i]),
);

function Home() {
	useMarkHomeSeen();

	return (
		<div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-12 lg:px-16 lg:py-14">
			<section className="grid grid-cols-1 items-center gap-6 lg:grid-cols-2 lg:gap-16">
				<div className="flex flex-col items-start">
					<h1 className="text-[clamp(1.875rem,5vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] text-foreground">
						Your Daily
						<br className="hidden lg:inline" />{" "}
						<span className="text-primary">Offline</span>
						<br className="hidden sm:inline" /> Toolkit
					</h1>
					<p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
						Your files never leave your browser. No uploads, no tracking.
					</p>
					<Link
						to="/converter"
						className={cn(
							buttonVariants({ size: "lg" }),
							"mt-6 px-4 text-base",
						)}
					>
						Convert an image
					</Link>
				</div>

				<div className="relative isolate order-first overflow-hidden rounded-xl bg-ctp-crust px-6 py-4 lg:order-last lg:py-6">
					<div
						aria-hidden
						className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_65%,color-mix(in_oklab,var(--cat-image)_22%,transparent),transparent_70%)]"
					/>
					<img
						src="/palico-hero.webp"
						srcSet="/palico-hero.webp 1x, /palico-hero@2x.webp 2x"
						width={560}
						height={492}
						fetchPriority="high"
						alt="Palico, a chibi cat adventurer with a hammer, your offline toolkit companion"
						className="mx-auto h-auto w-full max-w-36 lg:max-w-80"
					/>
				</div>
			</section>

			<div className="mt-10 grid gap-8 lg:mt-12 lg:gap-10">
				{toolGroups.map((group) => (
					<section key={group.id} aria-labelledby={`tools-${group.id}`}>
						<h2
							id={`tools-${group.id}`}
							className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground"
						>
							<span
								aria-hidden
								className={cn(
									"size-2.5 rounded-full",
									CATEGORY_STYLES[group.id].fill,
								)}
							/>
							{group.label}
						</h2>
						{/* Two columns from sm; an odd last tile spans the row. */}
						<ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2">
							{group.tools.map((tool) => (
								<li
									key={tool.to}
									className="tool-in grid"
									style={{ "--i": TILE_INDEX.get(tool.to) }}
								>
									<ToolTile tool={tool} />
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</div>
	);
}

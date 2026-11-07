import { Link } from "@tanstack/react-router";
import { useRef } from "react";

import { HeroLanes } from "#/components/home/hero-lanes.tsx";
import { useHeroPause } from "#/components/home/use-hero-pause.ts";
import { buttonVariants } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

/**
 * The home hero, one h1 in two variants. The page is prerendered, so the markup
 * is the same for everyone and home.css picks the variant from
 * `html[data-returning]` before first paint:
 *
 * - Full (first visit, the default): headline, tagline, the "Convert an image"
 *   button, and the mascot on a Crust panel with the tool lanes behind it.
 * - Compact (a favourite or recent tool exists): a short Crust band with the
 *   headline on the left and the tool lanes on the right. No mascot and no button.
 *
 * Why, the motion rules and the returning rule: docs/home-page.md.
 */
export function Hero() {
	const ref = useRef<HTMLElement>(null);

	useHeroPause(ref);

	return (
		<section ref={ref} className="home-hero" aria-labelledby="home-title">
			<div className="hero-copy flex flex-col items-start">
				<h1
					id="home-title"
					className="text-[clamp(1.875rem,5vw,3rem)] font-black leading-[1.05] tracking-[-0.01em] text-foreground"
				>
					{m.home_hero_before()}
					<br className="hidden lg:inline" />{" "}
					<span className="text-primary">{m.home_hero_highlight()}</span>
					<br className="hidden sm:inline" /> {m.home_hero_after()}
				</h1>
				<p className="hero-tagline mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
					{m.home_tagline()}
				</p>
				<Link
					to="/converter"
					className={cn(
						buttonVariants({ size: "lg" }),
						"hero-cta mt-6 px-4 text-base",
					)}
				>
					{m.home_cta()}
				</Link>
			</div>

			<div className="hero-art relative isolate order-first overflow-hidden rounded-xl bg-ctp-crust px-6 py-4 lg:order-last lg:py-6">
				<div
					aria-hidden
					className="hero-glow absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_65%,color-mix(in_oklab,var(--cat-image)_22%,transparent),transparent_70%)]"
				/>
				<HeroLanes />
				<img
					src="/palico-hero.webp"
					srcSet="/palico-hero.webp 1x, /palico-hero@2x.webp 2x"
					width={560}
					height={492}
					fetchPriority="high"
					alt={m.home_hero_alt()}
					className="hero-mascot relative mx-auto h-auto w-full max-w-36 lg:max-w-80"
				/>
			</div>
		</section>
	);
}

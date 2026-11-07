import { useRef } from "react";

import { HeroLanes } from "#/components/home/hero-lanes.tsx";
import { useHeroPause } from "#/components/home/use-hero-pause.ts";
import { m } from "#/paraglide/messages.js";

/**
 * The home hero: one Crust band for every visitor, with the headline and tagline
 * on the left and the sliding tool lanes on the right. No mascot and no button.
 * Sizes and motion live in home.css; why in docs/home-page.md.
 */
export function Hero() {
	const ref = useRef<HTMLElement>(null);

	useHeroPause(ref);

	return (
		<section ref={ref} className="home-hero" aria-labelledby="home-title">
			<div className="hero-copy flex flex-col items-start">
				<h1
					id="home-title"
					className="font-black leading-[1.05] tracking-[-0.01em] text-foreground"
				>
					{m.home_hero_before()}{" "}
					<span className="text-primary">{m.home_hero_highlight()}</span>{" "}
					{m.home_hero_after()}
				</h1>
				<p className="hero-tagline text-muted-foreground">{m.home_tagline()}</p>
			</div>

			<div className="hero-art">
				<HeroLanes />
			</div>
		</section>
	);
}

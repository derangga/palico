import { createFileRoute } from "@tanstack/react-router";

import "#/components/home/home.css";
import { BrowseByType } from "#/components/home/browse-by-type.tsx";
import { Hero } from "#/components/home/hero.tsx";
import { StartHere } from "#/components/home/start-here.tsx";
import { useReturningFlag } from "#/components/home/use-returning-flag.ts";
import { YourTools } from "#/components/home/your-tools.tsx";
import { seoHead } from "#/lib/seo.ts";
import { TOOLS } from "#/lib/tool-categories.ts";
import { yourToolsScript } from "#/lib/tool-history/prepaint.ts";

export const Route = createFileRoute("/")({
	head: () => {
		const seo = seoHead("/");

		return {
			...seo,
			scripts: [
				...seo.scripts,
				// Sets data-returning and reserves the height of the "Your tools" row
				// before first paint. See prepaint.ts and docs/home-page.md.
				{ children: yourToolsScript(TOOLS.map((tool) => tool.to)) },
			],
		};
	},
	component: Home,
});

function Home() {
	useReturningFlag();

	return (
		<div className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-12 lg:px-16 lg:py-14">
			<Hero />

			<div className="mt-10 lg:mt-12">
				{/* Before the row, so a first star taps a starter tile and the row opens below it. */}
				<StartHere />
				<YourTools />
				<BrowseByType />
			</div>
		</div>
	);
}

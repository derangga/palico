import { createFileRoute } from "@tanstack/react-router";

import { PaletteExtractor } from "#/components/palette/palette-extractor.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/palette-extractor")({
	head: () => seoHead("/palette-extractor"),
	component: PaletteExtractor,
});

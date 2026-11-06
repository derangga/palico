import { createFileRoute } from "@tanstack/react-router";

import { JsonConverter } from "#/components/json-converter/json-converter.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/json-converter")({
	head: () => seoHead("/json-converter"),
	component: JsonConverter,
});

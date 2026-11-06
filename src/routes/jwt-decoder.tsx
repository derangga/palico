import { createFileRoute } from "@tanstack/react-router";

import { JwtDecoder } from "#/components/jwt-decoder/jwt-decoder.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/jwt-decoder")({
	head: () => seoHead("/jwt-decoder"),
	component: JwtDecoder,
});

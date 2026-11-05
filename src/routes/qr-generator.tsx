import { createFileRoute } from "@tanstack/react-router";

import { QrGenerator } from "#/components/qr/qr-generator.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/qr-generator")({
	head: () => seoHead("/qr-generator"),
	component: QrGenerator,
});

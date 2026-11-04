import { createFileRoute } from "@tanstack/react-router";

import { QrReader } from "#/components/qr/qr-reader.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/qr-reader")({
	head: () => seoHead("/qr-reader"),
	component: QrReader,
});

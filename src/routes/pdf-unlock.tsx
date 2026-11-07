import { createFileRoute } from "@tanstack/react-router";

import { PdfPasswordTool } from "#/components/pdf-password/pdf-password-tool.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/pdf-unlock")({
	head: () => seoHead("/pdf-unlock"),
	component: UnlockPdfPage,
});

function UnlockPdfPage() {
	return <PdfPasswordTool mode="unlock" />;
}

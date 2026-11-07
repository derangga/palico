import { createFileRoute } from "@tanstack/react-router";

import { PdfPasswordTool } from "#/components/pdf-password/pdf-password-tool.tsx";
import { seoHead } from "#/lib/seo.ts";

export const Route = createFileRoute("/pdf-protect")({
	head: () => seoHead("/pdf-protect"),
	component: ProtectPdfPage,
});

function ProtectPdfPage() {
	return <PdfPasswordTool mode="protect" />;
}

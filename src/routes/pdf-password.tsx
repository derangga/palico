import { createFileRoute } from "@tanstack/react-router";

import { PdfPasswordTool } from "#/components/pdf-password/pdf-password-tool.tsx";
import type { PasswordMode } from "#/lib/pdf-password/shapes.ts";
import { seoHead } from "#/lib/seo.ts";

// `?mode=unlock` opens the page on Unlock, for a link from another tool. Anything
// else is ignored and the page picks the mode from the file.
const modeFrom = (value: unknown): PasswordMode | undefined =>
	value === "protect" || value === "unlock" ? value : undefined;

export const Route = createFileRoute("/pdf-password")({
	validateSearch: (search: Record<string, unknown>) => ({
		mode: modeFrom(search.mode),
	}),
	head: () => seoHead("/pdf-password"),
	component: PdfPasswordPage,
});

function PdfPasswordPage() {
	const { mode } = Route.useSearch();

	return <PdfPasswordTool initialMode={mode} />;
}

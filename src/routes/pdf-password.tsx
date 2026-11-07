import { createFileRoute } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { PdfPasswordTool } from "#/components/pdf-password/pdf-password-tool.tsx";
import { PasswordMode } from "#/lib/pdf-password/shapes.ts";
import { seoHead } from "#/lib/seo.ts";

const decodeMode = Schema.decodeUnknownOption(PasswordMode);

// The only part of the address the page reads. `?mode=unlock` opens the page on
// Unlock, for a link from another tool. A missing or unknown mode is dropped and the
// page picks the mode from the file.
interface PasswordSearch {
	readonly mode?: string;
}

export const Route = createFileRoute("/pdf-password")({
	validateSearch: (search: PasswordSearch) => ({
		mode: Option.getOrUndefined(decodeMode(search.mode)),
	}),
	head: () => seoHead("/pdf-password"),
	component: PdfPasswordPage,
});

function PdfPasswordPage() {
	const { mode } = Route.useSearch();

	// Keyed by the link's mode, so following a link to ?mode=unlock while on this page
	// opens it on Unlock instead of being ignored.
	return <PdfPasswordTool key={mode ?? "auto"} initialMode={mode} />;
}

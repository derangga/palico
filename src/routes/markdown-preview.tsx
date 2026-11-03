import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { MarkdownPreviewSkeleton } from "#/components/page-skeletons.tsx";

// react-markdown + its remark/rehype plugins (and, later, mermaid) are a chunk
// of their own; keep the workspace lazy so the rest of the app isn't weighed
// down by the markdown engine.
const MarkdownWorkspace = lazy(() =>
	import("#/components/markdown-workspace.tsx").then((m) => ({
		default: m.MarkdownWorkspace,
	})),
);

export const Route = createFileRoute("/markdown-preview")({
	component: MarkdownPreviewPage,
});

function MarkdownPreviewPage() {
	return (
		<Suspense fallback={<MarkdownPreviewSkeleton />}>
			<MarkdownWorkspace />
		</Suspense>
	);
}

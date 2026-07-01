import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

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
		<Suspense
			fallback={
				<div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<MarkdownWorkspace />
		</Suspense>
	);
}

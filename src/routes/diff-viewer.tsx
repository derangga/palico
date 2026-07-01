import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";

// The workspace pulls in @pierre/diffs + its worker; keep it lazy so the rest
// of the app isn't weighed down by the diff engine. It also owns the persistent
// worker-pool provider, so it must stay mounted for the whole route lifetime.
const DiffWorkspace = lazy(() => import("#/components/diff-workspace.tsx"));

export const Route = createFileRoute("/diff-viewer")({
	component: DiffViewerPage,
});

function DiffViewerPage() {
	return (
		<Suspense
			fallback={
				<div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<DiffWorkspace />
		</Suspense>
	);
}

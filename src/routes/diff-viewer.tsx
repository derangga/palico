import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

import { DiffViewerSkeleton } from "#/components/page-skeletons.tsx";

// The workspace pulls in @pierre/diffs + its worker; keep it lazy so the rest
// of the app isn't weighed down by the diff engine. It also owns the persistent
// worker-pool provider, so it must stay mounted for the whole route lifetime.
const DiffWorkspace = lazy(() => import("#/components/diff-workspace.tsx"));

export const Route = createFileRoute("/diff-viewer")({
	component: DiffViewerPage,
});

function DiffViewerPage() {
	return (
		<Suspense fallback={<DiffViewerSkeleton />}>
			<DiffWorkspace />
		</Suspense>
	);
}

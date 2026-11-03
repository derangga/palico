// Suspense fallbacks for the lazy routes. They render the same PageShell and
// PageHeader (same copy) as the loaded workspace, so the layout doesn't jump.

import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";

export const MARKDOWN_DESCRIPTION =
	"Type Markdown on the left and see it rendered live on the right. Everything runs on your device. Nothing is uploaded.";

export const DIFF_DESCRIPTION =
	"Paste your original and changed text side by side, then find the differences. Everything runs on your device. Nothing is uploaded.";

export function MarkdownPreviewSkeleton() {
	return (
		<PageShell width="full" aria-busy="true">
			<PageHeader title="Markdown Preview">{MARKDOWN_DESCRIPTION}</PageHeader>
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<Skeleton className="h-[1000px]" />
				<Skeleton className="h-[1000px]" />
			</div>
		</PageShell>
	);
}

export function DiffViewerSkeleton() {
	return (
		<PageShell width="full" aria-busy="true">
			<PageHeader title="File Diff Viewer">{DIFF_DESCRIPTION}</PageHeader>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				{["original", "changed"].map((key) => (
					<div key={key} className="flex flex-col gap-1.5">
						<Skeleton className="h-4 w-16" />
						<Skeleton className="h-[55vh]" />
					</div>
				))}
			</div>
			<div className="mt-6 flex justify-center">
				<Skeleton className="h-9 w-40" />
			</div>
		</PageShell>
	);
}

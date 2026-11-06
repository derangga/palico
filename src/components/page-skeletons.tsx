// Suspense fallbacks for the lazy routes. They render the same PageShell and
// PageHeader (same copy) as the loaded workspace, so the layout doesn't jump.

import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { m } from "#/paraglide/messages.js";

export function MarkdownPreviewSkeleton() {
	return (
		<PageShell width="full" aria-busy="true">
			<PageHeader title={m.tool_markdown_preview_label()}>
				{m.markdown_description()}
			</PageHeader>
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
			<PageHeader title={m.diff_page_title()}>
				{m.diff_description()}
			</PageHeader>
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

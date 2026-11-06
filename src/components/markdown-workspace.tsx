import { Effect, Option, Exit } from "effect";
import { Eye } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";

import { MarkdownPreviewDrawer } from "#/components/markdown-preview-drawer.tsx";
import { MarkdownPreviewPanel } from "#/components/markdown-preview-panel.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { useIsMobile } from "#/hooks/use-mobile.ts";
import { sampleMarkdown } from "#/lib/markdown/sample.ts";
import { loadMarkdown, saveMarkdown } from "#/lib/markdown/storage.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

// Both panels are a fixed height in the normal split view; in fullscreen the
// preview grows to fill the viewport below the app's top bar (h-14 / 3.5rem)
// minus this page's vertical padding (PageShell py-10).
const PANEL_HEIGHT = "h-[1000px]";
const FULLSCREEN_HEIGHT = "h-[calc(100svh-3.5rem-5rem)]";

export function MarkdownWorkspace() {
	// Restore synchronously on first render (client only — the workspace is
	// lazy-loaded). loadMarkdown is a synchronous Effect, so we can seed the real
	// value here rather than flashing an empty editor and re-setting from a mount
	// effect. A missing key means a genuine first visit → seed the sample; a
	// storage failure falls back to the sample too rather than leaving a blank
	// editor.
	const [source, setSource] = useState(() => {
		const exit = Effect.runSyncExit(loadMarkdown);

		return Exit.isSuccess(exit)
			? Option.getOrElse(exit.value, sampleMarkdown)
			: sampleMarkdown();
	});

	// A phone gets a Preview button and a bottom sheet instead of a second panel.
	const isMobile = useIsMobile();
	const [previewOpen, setPreviewOpen] = useState(false);

	// Fullscreen is an in-layout toggle: the editor is hidden and the preview
	// takes the full content width (the sidebar and top bar stay put). It does
	// not exist on a phone, where the sheet can be dragged to nearly full height.
	const [fullscreenOn, setIsFullscreen] = useState(false);
	const isFullscreen = fullscreenOn && !isMobile;
	// Keep the expensive preview render (markdown parse + mermaid) off the
	// keystroke path. useDeferredValue lets React interrupt superseded low-
	// priority renders, so the preview only fully catches up once typing pauses —
	// debounce-like behavior with no timer or extra state, and it also throttles
	// the persistence writes below.
	const deferredSource = useDeferredValue(source);

	// Best-effort persistence of the deferred document; ignore storage failures.
	// `source` is seeded from storage above, so the first write is a harmless
	// no-op rather than clobbering the stored document with an empty state.
	// The seeded sample is not saved. It is shown in the active language, so a
	// first visit that switches language sees the sample follow it. The first
	// edit makes the document the person's own and saves it.
	useEffect(() => {
		if (deferredSource === sampleMarkdown()) return;

		Effect.runSyncExit(saveMarkdown(deferredSource));
	}, [deferredSource]);

	return (
		<PageShell width="full">
			{!isFullscreen && (
				<PageHeader title={m.tool_markdown_preview_label()}>
					{m.markdown_description()}
				</PageHeader>
			)}

			<div
				className={cn(
					"grid grid-cols-1 gap-4",
					!isFullscreen && "lg:grid-cols-2",
					// The open sheet covers the bottom half, so the page scrolls that far
					// further and the end of the editor can still be reached.
					isMobile && previewOpen && "pb-[50svh]",
				)}
			>
				{!isFullscreen && (
					<Textarea
						value={source}
						onChange={(event) => setSource(event.target.value)}
						placeholder={m.markdown_placeholder()}
						spellCheck={false}
						className={cn(
							"resize-none overflow-auto font-mono text-sm",
							isMobile ? "h-[55svh]" : PANEL_HEIGHT,
						)}
						aria-label={m.markdown_source_aria()}
					/>
				)}

				{isMobile ? (
					<>
						<Button
							type="button"
							onClick={() => setPreviewOpen(true)}
							className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 h-11 w-full"
						>
							<Eye />
							{m.markdown_preview()}
						</Button>
						<MarkdownPreviewDrawer
							source={source}
							previewSource={deferredSource}
							open={previewOpen}
							onOpenChange={setPreviewOpen}
						/>
					</>
				) : (
					<MarkdownPreviewPanel
						source={source}
						previewSource={deferredSource}
						isFullscreen={isFullscreen}
						onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
						heightClass={isFullscreen ? FULLSCREEN_HEIGHT : PANEL_HEIGHT}
					/>
				)}
			</div>
		</PageShell>
	);
}

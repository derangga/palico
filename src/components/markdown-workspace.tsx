import { Effect, Option, Exit } from "effect";
import { useDeferredValue, useEffect, useState } from "react";

import { MarkdownPreviewPanel } from "#/components/markdown-preview-panel.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { MARKDOWN_DESCRIPTION } from "#/components/page-skeletons.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { SAMPLE_MARKDOWN } from "#/lib/markdown/sample.ts";
import { loadMarkdown, saveMarkdown } from "#/lib/markdown/storage.ts";

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
			? Option.getOrElse(exit.value, () => SAMPLE_MARKDOWN)
			: SAMPLE_MARKDOWN;
	});

	// Fullscreen is an in-layout toggle: the editor is hidden and the preview
	// takes the full content width (the sidebar and top bar stay put).
	const [isFullscreen, setIsFullscreen] = useState(false);
	// Keep the expensive preview render (markdown parse + mermaid) off the
	// keystroke path. useDeferredValue lets React interrupt superseded low-
	// priority renders, so the preview only fully catches up once typing pauses —
	// debounce-like behavior with no timer or extra state, and it also throttles
	// the persistence writes below.
	const deferredSource = useDeferredValue(source);

	// Best-effort persistence of the deferred document; ignore storage failures.
	// `source` is seeded from storage above, so the first write is a harmless
	// no-op rather than clobbering the stored document with an empty state.
	useEffect(() => {
		Effect.runSyncExit(saveMarkdown(deferredSource));
	}, [deferredSource]);

	return (
		<PageShell width="full">
			{!isFullscreen && (
				<PageHeader title="Markdown Preview">{MARKDOWN_DESCRIPTION}</PageHeader>
			)}

			<div
				className={
					isFullscreen
						? "grid grid-cols-1 gap-4"
						: "grid grid-cols-1 gap-4 lg:grid-cols-2"
				}
			>
				{!isFullscreen && (
					<Textarea
						value={source}
						onChange={(event) => setSource(event.target.value)}
						placeholder="Type Markdown here…"
						spellCheck={false}
						className={`${PANEL_HEIGHT} resize-none overflow-auto font-mono text-sm`}
						aria-label="Markdown source"
					/>
				)}

				<MarkdownPreviewPanel
					source={source}
					previewSource={deferredSource}
					isFullscreen={isFullscreen}
					onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
					heightClass={isFullscreen ? FULLSCREEN_HEIGHT : PANEL_HEIGHT}
				/>
			</div>
		</PageShell>
	);
}

import { Effect, Option } from "effect";
import { useDeferredValue, useEffect, useState } from "react";

import { MarkdownPreviewPanel } from "#/components/markdown-preview-panel.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { SAMPLE_MARKDOWN } from "#/lib/markdown/sample.ts";
import { loadMarkdown, saveMarkdown } from "#/lib/markdown/storage.ts";

// Both panels are a fixed height in the normal split view; in fullscreen the
// preview grows to fill the viewport below the app's top bar (h-14 / 3.5rem)
// minus this page's vertical padding.
const PANEL_HEIGHT = "h-[1000px]";
const FULLSCREEN_HEIGHT = "h-[calc(100svh-3.5rem-4rem)]";

export function MarkdownWorkspace() {
	// Restore synchronously on first render (client only — the workspace is
	// lazy-loaded). loadMarkdown is a synchronous Effect, so we can seed the real
	// value here rather than flashing an empty editor and re-setting from a mount
	// effect. A missing key means a genuine first visit → seed the sample; a
	// storage failure falls back to the sample too rather than leaving a blank
	// editor.
	const [source, setSource] = useState(() => {
		const exit = Effect.runSyncExit(loadMarkdown);
		return exit._tag === "Success"
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
		<div className="mx-auto w-full max-w-7xl px-6 py-8">
			{!isFullscreen && (
				<div className="mb-6">
					<h1 className="text-2xl font-bold">Markdown Preview</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Type Markdown on the left and see it rendered live on the right.
						Everything runs on your device — nothing is uploaded.
					</p>
				</div>
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
		</div>
	);
}

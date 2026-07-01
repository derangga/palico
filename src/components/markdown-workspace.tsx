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
	const [source, setSource] = useState("");
	// Gate persistence until the first load resolves so we never clobber the
	// stored document with the initial empty state during hydration.
	const [hydrated, setHydrated] = useState(false);
	// Fullscreen is an in-layout toggle: the editor is hidden and the preview
	// takes the full content width (the sidebar and top bar stay put).
	const [isFullscreen, setIsFullscreen] = useState(false);
	// Keep the expensive preview render (markdown parse + mermaid) off the
	// keystroke path. useDeferredValue lets React interrupt superseded low-
	// priority renders, so the preview only fully catches up once typing pauses —
	// debounce-like behavior with no timer or extra state, and it also throttles
	// the persistence writes below.
	const deferredSource = useDeferredValue(source);

	// Restore on mount (client only — the workspace is lazy-loaded). A missing
	// key means a genuine first visit, so seed the sample; a storage failure
	// falls back to the sample too rather than leaving a blank editor.
	useEffect(() => {
		const exit = Effect.runSyncExit(loadMarkdown);
		const restored =
			exit._tag === "Success"
				? Option.getOrElse(exit.value, () => SAMPLE_MARKDOWN)
				: SAMPLE_MARKDOWN;
		setSource(restored);
		setHydrated(true);
	}, []);

	// Best-effort persistence of the deferred document; ignore storage failures.
	useEffect(() => {
		if (!hydrated) return;
		Effect.runSyncExit(saveMarkdown(deferredSource));
	}, [deferredSource, hydrated]);

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

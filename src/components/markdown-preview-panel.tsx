import { Cause, Effect, Option, Exit } from "effect";
import { Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

import { MarkdownPreview } from "#/components/markdown-preview.tsx";
import { Button } from "#/components/ui/button.tsx";
import { copyMarkdown, downloadMarkdown } from "#/lib/markdown/actions.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

const DOWNLOAD_FILENAME = "document.md";

// Copy and Download buttons. They act on `source`, the live text in the editor,
// so the desktop toolbar and the mobile drawer share them.
export function MarkdownActions({
	source,
	className,
}: {
	readonly source: string;
	readonly className?: string;
}) {
	async function handleCopy() {
		const exit = await Effect.runPromiseExit(copyMarkdown(source));

		if (Exit.isSuccess(exit)) {
			recordToolUse("/markdown-preview");
			toast.success(m.markdown_copied());

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
		toast.error(failure?.message ?? m.markdown_copy_failed());
	}

	async function handleDownload() {
		const exit = await Effect.runPromiseExit(
			downloadMarkdown(source, DOWNLOAD_FILENAME),
		);

		if (Exit.isSuccess(exit)) {
			recordToolUse("/markdown-preview");

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));
		toast.error(failure?.message ?? m.markdown_download_failed());
	}

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className={className}
				onClick={handleCopy}
				aria-label={m.markdown_copy()}
				title={m.markdown_copy()}
			>
				<Copy />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				className={className}
				onClick={handleDownload}
				aria-label={m.markdown_download()}
				title={m.markdown_download()}
			>
				<Download />
			</Button>
		</>
	);
}

// The rendered preview plus its floating toolbar. The toolbar is pinned to the
// top-right corner with a translucent, blurred backdrop so it reads as an
// overlay on top of the content it controls rather than part of the document.
// `previewSource` is the debounced text that gets rendered; `source` is the
// live text so Copy/Download always act on exactly what's in the editor.
export function MarkdownPreviewPanel({
	source,
	previewSource,
	isFullscreen,
	onToggleFullscreen,
	heightClass,
}: {
	readonly source: string;
	readonly previewSource: string;
	readonly isFullscreen: boolean;
	readonly onToggleFullscreen: () => void;
	readonly heightClass: string;
}) {
	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-md border border-input bg-background",
				heightClass,
			)}
		>
			<div className="absolute top-3 right-3 z-10 flex gap-1 rounded-md border border-border/60 bg-background/50 p-1 shadow-xs backdrop-blur-md">
				<MarkdownActions source={source} />
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onToggleFullscreen}
					aria-label={
						isFullscreen
							? m.markdown_fullscreen_exit()
							: m.markdown_fullscreen_enter()
					}
					title={
						isFullscreen
							? m.markdown_fullscreen_exit()
							: m.markdown_fullscreen_enter()
					}
				>
					{isFullscreen ? <Minimize2 /> : <Maximize2 />}
				</Button>
			</div>

			<div className="h-full overflow-auto p-6">
				<MarkdownPreview source={previewSource} />
			</div>
		</div>
	);
}

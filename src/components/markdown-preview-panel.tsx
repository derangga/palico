import { Effect } from "effect";
import { Copy, Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";

import { MarkdownPreview } from "#/components/markdown-preview.tsx";
import { Button } from "#/components/ui/button.tsx";
import { copyMarkdown, downloadMarkdown } from "#/lib/markdown/actions.ts";
import { cn } from "#/lib/utils.ts";

const DOWNLOAD_FILENAME = "document.md";

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
	async function handleCopy() {
		const exit = await Effect.runPromiseExit(copyMarkdown(source));
		if (exit._tag === "Success") {
			toast.success("Markdown copied to clipboard.");
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		toast.error(failure?.message ?? "Couldn't copy to the clipboard.");
	}

	async function handleDownload() {
		const exit = await Effect.runPromiseExit(
			downloadMarkdown(source, DOWNLOAD_FILENAME),
		);
		if (exit._tag === "Success") return;
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		toast.error(failure?.message ?? "Couldn't download the file.");
	}

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-md border border-input bg-background",
				heightClass,
			)}
		>
			<div className="absolute top-3 right-3 z-10 flex gap-1 rounded-md border border-border/60 bg-background/50 p-1 shadow-xs backdrop-blur-md">
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={handleCopy}
					aria-label="Copy Markdown"
					title="Copy Markdown"
				>
					<Copy />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={handleDownload}
					aria-label="Download .md"
					title="Download .md"
				>
					<Download />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onToggleFullscreen}
					aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
					title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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

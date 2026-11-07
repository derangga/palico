import { Download, FileText } from "lucide-react";

import { downloadBlob } from "#/components/converter/utils.ts";
import { SendTo, type LazyOutputs } from "#/components/handoff/send-to.tsx";
import { Button } from "#/components/ui/button.tsx";
import type { SendOutput } from "#/hooks/use-send-files.ts";
import type { ToolId } from "#/lib/tool-categories.ts";
import { m } from "#/paraglide/messages.js";

/** A file a tool has just saved, kept so it can be saved again or sent on. */
export interface SavedFile {
	readonly blob: Blob;
	readonly name: string;
	/** Size, page or file count: the line under the name. */
	readonly detail: string;
	/** What "Send to..." sends. A zip goes as the files inside it (`zippedOutputs`). */
	readonly outputs: ReadonlyArray<SendOutput> | LazyOutputs;
}

/**
 * The result row for a tool that downloads as soon as the job ends (PDF merge,
 * split, organize, to images). The file is already saved. The row keeps it on
 * screen so it can be saved again or sent to the next tool.
 */
export function SavedResult({
	from,
	saved,
}: {
	readonly from: ToolId;
	readonly saved: SavedFile;
}) {
	return (
		<div
			aria-live="polite"
			className="animate-pop-in flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 py-2.5"
		>
			<FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-32 flex-1">
				<p className="truncate text-sm font-medium">{saved.name}</p>
				<p className="text-xs text-muted-foreground tabular-nums">
					{saved.detail}
				</p>
			</div>
			<div className="ml-auto flex gap-2">
				<SendTo from={from} outputs={saved.outputs} />
				<Button
					variant="outline"
					onClick={() => downloadBlob(saved.blob, saved.name)}
				>
					<Download />
					{m.common_save()}
				</Button>
			</div>
		</div>
	);
}

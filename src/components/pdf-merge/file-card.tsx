import { GripVertical, X } from "lucide-react";

import { CoverThumbnail } from "#/components/pdf-merge/cover-thumbnail.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";
import { formatBytes } from "#/lib/format-bytes.ts";
import { pagesLabel } from "#/lib/i18n/counts.ts";
import { m } from "#/paraglide/messages.js";

// One file's card: drag handle, cover thumbnail, name + size + page count, and a
// remove button. The whole row is draggable so the cards can be reordered.
export function FileCard({
	item,
	index,
	onRemove,
	onDragStart,
	onDrop,
}: {
	item: MergeItem;
	index: number;
	onRemove: () => void;
	onDragStart: () => void;
	onDrop: () => void;
}) {
	return (
		// oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag-and-drop reorder target. There is no keyboard reorder yet.
		<li
			draggable
			onDragStart={onDragStart}
			onDragOver={(e) => e.preventDefault()}
			onDrop={(e) => {
				e.preventDefault();
				onDrop();
			}}
			className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
		>
			<GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground" />
			<span className="text-xs font-medium text-muted-foreground">
				{index + 1}
			</span>
			<CoverThumbnail item={item} />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "ready" && (
						<>
							{" · "}
							{pagesLabel(item.pageCount)}
						</>
					)}
					{item.status === "loading" && ` · ${m.pdfmerge_reading()}`}
					{item.status === "error" && (
						<span className="text-destructive">
							{" "}
							· {m.pdfmerge_card_failed()}
						</span>
					)}
				</p>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label={m.common_remove_file({ name: item.file.name })}
			>
				<X className="size-4" />
			</button>
		</li>
	);
}

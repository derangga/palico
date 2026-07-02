import { GripVertical, X } from "lucide-react";

import { CoverThumbnail } from "#/components/pdf-merge/cover-thumbnail.tsx";
import type { MergeItem } from "#/components/pdf-merge/types.ts";

const MB = 1024 * 1024;

function formatBytes(n: number) {
	if (n < 1024) return `${n} B`;
	if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / MB).toFixed(2)} MB`;
}

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
							{item.pageCount} {item.pageCount === 1 ? "page" : "pages"}
						</>
					)}
					{item.status === "loading" && " · reading…"}
					{item.status === "error" && (
						<span className="text-destructive"> · failed</span>
					)}
				</p>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label={`Remove ${item.file.name}`}
			>
				<X className="size-4" />
			</button>
		</li>
	);
}

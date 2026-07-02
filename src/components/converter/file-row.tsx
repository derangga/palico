import { Download, ImageIcon, X } from "lucide-react";

import { StatusBadge } from "#/components/converter/status-badge.tsx";
import type { Item } from "#/components/converter/types.ts";
import { formatBytes, handleSaveOne } from "#/components/converter/utils.ts";
import { Button } from "#/components/ui/button.tsx";

export function FileRow({
	item,
	isRunning,
	onRemove,
}: {
	item: Item;
	isRunning: boolean;
	onRemove: () => void;
}) {
	return (
		<li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
			<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (${item.outLabel})`}
					{item.status === "error" && item.message && (
						<span className="text-destructive"> — {item.message}</span>
					)}
				</p>
			</div>
			<StatusBadge status={item.status} />
			{item.status === "done" && item.outBlob && (
				<Button variant="ghost" size="sm" onClick={() => handleSaveOne(item)}>
					<Download />
					Save
				</Button>
			)}
			{!isRunning && (
				<button
					type="button"
					onClick={onRemove}
					className="text-muted-foreground hover:text-foreground"
					aria-label={`Remove ${item.file.name}`}
				>
					<X className="size-4" />
				</button>
			)}
		</li>
	);
}

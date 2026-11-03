import { Columns2, Download, ImageIcon, X } from "lucide-react";
import { StatusBadge } from "#/components/converter/status-badge.tsx";
import type { Item } from "#/components/converter/types.ts";
import { formatBytes, handleSaveOne } from "#/components/converter/utils.ts";
import { useJustDone } from "#/components/done-burst.tsx";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";

export function FileRow({
	item,
	isRunning,
	onRemove,
	onCompare,
}: {
	item: Item;
	isRunning: boolean;
	onRemove: () => void;
	onCompare?: () => void;
}) {
	const justDone = useJustDone(item.status === "done");

	return (
		<li
			className={cn(
				"animate-pop-in flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
				justDone && "animate-done-tint",
			)}
		>
			<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (${item.outLabel})`}
					{item.status === "done" &&
						item.savedPct != null &&
						item.savedPct > 0 &&
						` · ${item.savedPct}% smaller`}
					{item.status === "error" && item.message && (
						<span className="text-destructive">: {item.message}</span>
					)}
				</p>
				{item.status === "done" && item.note && (
					<p className="text-xs text-muted-foreground">{item.note}</p>
				)}
			</div>
			<StatusBadge status={item.status} celebrate={justDone} />
			{item.status === "done" && onCompare && (
				<Button variant="ghost" size="sm" onClick={onCompare}>
					<Columns2 />
					Compare
				</Button>
			)}
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

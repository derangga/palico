import { Download, Film, X } from "lucide-react";

import { useJustDone } from "#/components/done-burst.tsx";
import { Button } from "#/components/ui/button.tsx";
import { StatusBadge } from "#/components/video-converter/status-badge.tsx";
import type { Item } from "#/components/video-converter/types.ts";
import {
	formatBytes,
	handleSaveOne,
} from "#/components/video-converter/utils.ts";
import { cn } from "#/lib/utils.ts";

export function FileRow({
	item,
	isRunning,
	onRemove,
}: {
	item: Item;
	isRunning: boolean;
	onRemove: () => void;
}) {
	const justDone = useJustDone(item.status === "done");

	return (
		<li
			className={cn(
				"animate-pop-in flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
				justDone && "animate-done-tint",
			)}
		>
			<Film className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "processing" &&
						item.percent !== undefined &&
						` · ${item.percent}%`}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (${item.outLabel})`}
					{item.status === "error" && item.message && (
						<span className="text-destructive"> · {item.message}</span>
					)}
				</p>
				{item.status === "processing" && (
					<div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
						<div
							className="progress-stripes h-full bg-cat-video transition-[width] duration-150 ease-out"
							style={{ width: `${item.percent ?? 0}%` }}
						/>
					</div>
				)}
			</div>
			<StatusBadge status={item.status} celebrate={justDone} />
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

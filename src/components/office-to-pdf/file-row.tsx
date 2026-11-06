import { Download, FileText, X } from "lucide-react";

import { useJustDone } from "#/components/done-burst.tsx";
import type {
	ItemStatus,
	OfficeItem,
} from "#/components/office-to-pdf/types.ts";
import { formatBytes } from "#/components/office-to-pdf/utils.ts";
import { StatusPill } from "#/components/status-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

export function FileRow({
	item,
	converting,
	onRemove,
	onSave,
}: {
	item: OfficeItem;
	converting: boolean;
	onRemove: () => void;
	onSave: () => void;
}) {
	const justDone = useJustDone(item.status === "done");

	return (
		<li
			className={cn(
				"animate-pop-in flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
				justDone && "animate-done-tint",
			)}
		>
			<FileText className="size-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (PDF)`}
					{item.status === "error" && item.message && (
						<span className="text-destructive">: {item.message}</span>
					)}
				</p>
			</div>
			<StatusBadge status={item.status} celebrate={justDone} />
			{item.status === "done" && item.outBlob && (
				<Button variant="ghost" size="sm" onClick={onSave}>
					<Download />
					{m.common_save()}
				</Button>
			)}
			{!converting && (
				<button
					type="button"
					onClick={onRemove}
					className="text-muted-foreground hover:text-foreground"
					aria-label={m.common_remove_file({ name: item.file.name })}
				>
					<X className="size-4" />
				</button>
			)}
		</li>
	);
}

function StatusBadge({
	status,
	celebrate,
}: {
	status: ItemStatus;
	celebrate: boolean;
}) {
	if (status === "converting") return <StatusPill state="working" />;

	if (status === "done")
		return <StatusPill state="done" celebrate={celebrate} />;

	if (status === "error") return <StatusPill state="failed" />;

	return null;
}

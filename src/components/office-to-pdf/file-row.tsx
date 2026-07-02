import {
	CheckCircle2,
	CircleAlert,
	Download,
	FileText,
	Loader2,
	X,
} from "lucide-react";

import type {
	ItemStatus,
	OfficeItem,
} from "#/components/office-to-pdf/types.ts";
import { formatBytes } from "#/components/office-to-pdf/utils.ts";
import { Button } from "#/components/ui/button.tsx";

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
	return (
		<li className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5">
			<FileText className="size-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{item.file.name}</p>
				<p className="text-xs text-muted-foreground">
					{formatBytes(item.file.size)}
					{item.status === "done" &&
						item.outSize != null &&
						` → ${formatBytes(item.outSize)} (PDF)`}
					{item.status === "error" && item.message && (
						<span className="text-destructive"> — {item.message}</span>
					)}
				</p>
			</div>
			<StatusBadge status={item.status} />
			{item.status === "done" && item.outBlob && (
				<Button variant="ghost" size="sm" onClick={onSave}>
					<Download />
					Save
				</Button>
			)}
			{!converting && (
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

function StatusBadge({ status }: { status: ItemStatus }) {
	if (status === "converting")
		return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
	if (status === "done")
		return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
	if (status === "error")
		return <CircleAlert className="size-4 shrink-0 text-destructive" />;
	return null;
}

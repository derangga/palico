import { Download } from "lucide-react";

import { DoneBurst, DrawCheck } from "#/components/done-burst.tsx";
import { formatBytes } from "#/components/resizer/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import type { ResizeOutput } from "#/lib/image/resizer.ts";
import { cn } from "#/lib/utils.ts";

export function ResultCard({
	result,
	previewUrl,
	formatLabel,
	onSave,
}: {
	result: ResizeOutput;
	previewUrl: string | null;
	formatLabel: string;
	onSave: () => void;
}) {
	return (
		<div className="animate-done-tint mt-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
			{/* The card only mounts when a resize finishes, so mounting is the done moment. */}
			<span className="relative shrink-0">
				{previewUrl && (
					<img
						src={previewUrl}
						alt=""
						className="size-12 rounded object-cover"
					/>
				)}
				<span
					className={cn(
						"flex items-center justify-center rounded-full bg-success text-success-foreground",
						previewUrl
							? "absolute -right-1.5 -bottom-1.5 size-5 ring-2 ring-card"
							: "size-6",
					)}
				>
					<DrawCheck play className="size-3" />
					<DoneBurst />
				</span>
			</span>
			<p className="min-w-0 flex-1 text-sm">
				Resized to{" "}
				<span className="font-medium">
					{result.width} × {result.height}px
				</span>{" "}
				<span className="text-muted-foreground">
					({formatBytes(result.size)}, {formatLabel})
				</span>
			</p>
			<Button variant="outline" size="sm" onClick={onSave}>
				<Download />
				Save
			</Button>
		</div>
	);
}

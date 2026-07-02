import { CheckCircle2, Download } from "lucide-react";

import { formatBytes } from "#/components/resizer/utils.ts";
import { Button } from "#/components/ui/button.tsx";
import type { ResizeOutput } from "#/lib/image/resizer.ts";

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
		<div className="mt-4 flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
			{previewUrl ? (
				<img
					src={previewUrl}
					alt=""
					className="size-12 shrink-0 rounded object-cover"
				/>
			) : (
				<CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
			)}
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

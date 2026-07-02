import { ArrowRight, ImageIcon, X } from "lucide-react";

export function SourceBar({
	fileName,
	srcW,
	srcH,
	outW,
	outH,
	formatLabel,
	onRemove,
}: {
	fileName: string;
	srcW: number;
	srcH: number;
	outW: number;
	outH: number;
	formatLabel: string;
	onRemove: () => void;
}) {
	return (
		<div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
			<ImageIcon className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{fileName}</p>
				<div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
					<span>
						{srcW} × {srcH}px
					</span>
					<ArrowRight className="size-3.5" />
					<span className="font-medium text-foreground">
						{outW || "?"} × {outH || "?"}px
					</span>
					<span>· {formatLabel}</span>
				</div>
			</div>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-foreground"
				aria-label="Remove image"
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

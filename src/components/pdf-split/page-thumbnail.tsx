import { Check } from "lucide-react";
import { useEffect, useRef } from "react";

import type { PdfThumbnail } from "#/lib/file/pdf-types.ts";

// Paints a transferred ImageBitmap onto a canvas. Drawing is a one-shot effect
// keyed to the bitmap identity. When selectable, the whole card is a toggle.
export function PageThumbnail({
	thumbnail,
	selectable,
	selected,
	onToggle,
}: {
	thumbnail: PdfThumbnail;
	selectable: boolean;
	selected: boolean;
	onToggle: () => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(thumbnail.bitmap, 0, 0);
	}, [thumbnail.bitmap]);

	return (
		<button
			type="button"
			onClick={selectable ? onToggle : undefined}
			disabled={!selectable}
			aria-pressed={selected}
			className={`group relative flex flex-col items-center gap-2 rounded-lg border bg-card p-2 text-left transition-colors ${
				selectable ? "cursor-pointer hover:border-primary/60" : "cursor-default"
			} ${selected ? "border-primary ring-2 ring-primary/30" : ""}`}
		>
			{selectable && (
				<span
					className={`absolute right-3 top-3 z-10 flex size-5 items-center justify-center rounded-full border transition-colors ${
						selected
							? "border-primary bg-primary text-primary-foreground"
							: "border-border bg-background/80 text-transparent group-hover:border-primary/60"
					}`}
				>
					<Check className="size-3.5" />
				</span>
			)}
			<canvas
				ref={canvasRef}
				width={thumbnail.width}
				height={thumbnail.height}
				className="h-auto w-full rounded-sm border border-border bg-white shadow-sm"
			/>
			<span className="text-xs font-medium text-muted-foreground">
				{thumbnail.index + 1}
			</span>
		</button>
	);
}

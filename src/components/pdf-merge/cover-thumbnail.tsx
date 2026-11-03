import { CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";

import type { MergeItem } from "#/components/pdf-merge/types.ts";

// Paints the transferred first-page ImageBitmap onto a small canvas. Shows a
// spinner while loading and an alert glyph if the file failed to render.
export function CoverThumbnail({ item }: { item: MergeItem }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		const bitmap = item.thumbnail?.bitmap;
		if (!canvas || !bitmap) return;
		const ctx = canvas.getContext("2d");
		ctx?.drawImage(bitmap, 0, 0);
	}, [item.thumbnail?.bitmap]);

	if (item.status === "loading") {
		return (
			<div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border border-border bg-white shadow-sm">
				<Loader2 className="size-4 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (item.status === "error" || !item.thumbnail) {
		return (
			<div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-sm border border-border bg-white shadow-sm">
				<CircleAlert className="size-4 text-destructive" />
			</div>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			width={item.thumbnail.width}
			height={item.thumbnail.height}
			className="h-14 w-auto shrink-0 rounded-sm border border-border bg-white shadow-sm"
		/>
	);
}

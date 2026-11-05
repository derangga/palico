import type { Ref } from "react";

import { WINDOW_RADIUS, WINDOW_SIDE } from "#/lib/color/sample.ts";

// The cursor pixel is the middle cell of the window. Its box is one cell wide.
const CELL = 100 / WINDOW_SIDE;

/**
 * The pixels around the cursor, blown up so one cell is one pixel of the image.
 * The parent draws into the canvas, so a pointer move does not re-render this.
 */
export function PixelReadout({
	canvasRef,
}: {
	readonly canvasRef: Ref<HTMLCanvasElement>;
}) {
	return (
		<div
			aria-hidden
			className="relative size-36 shrink-0 overflow-hidden rounded-md border border-input bg-muted"
		>
			<canvas
				ref={canvasRef}
				width={WINDOW_SIDE}
				height={WINDOW_SIDE}
				className="size-full [image-rendering:pixelated]"
			/>
			{/* Two outlines, one light and one dark, so the cell shows on any color. */}
			<span
				className="absolute border-2 border-background ring-2 ring-foreground"
				style={{
					left: `${CELL * WINDOW_RADIUS}%`,
					top: `${CELL * WINDOW_RADIUS}%`,
					width: `${CELL}%`,
					height: `${CELL}%`,
				}}
			/>
		</div>
	);
}

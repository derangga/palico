// Stand-ins for the two pdf.js factories that reach for `document`, for use in a
// worker, where there is none. Pass them to `getDocument` as `CanvasFactory` and
// `FilterFactory`.
//
// src/workers/pdf.worker.ts carries its own copy of these two classes. It is not
// edited here (another change owns that file); point it at this module when that
// settles.

export interface CanvasAndContext {
	canvas: OffscreenCanvas | null;
	context: OffscreenCanvasRenderingContext2D | null;
}

export class OffscreenCanvasFactory {
	create(width: number, height: number): CanvasAndContext {
		const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height));

		return { canvas, context: canvas.getContext("2d") };
	}

	reset(canvasAndContext: CanvasAndContext, width: number, height: number) {
		if (!canvasAndContext.canvas) return;
		canvasAndContext.canvas.width = Math.max(1, width);
		canvasAndContext.canvas.height = Math.max(1, height);
	}

	destroy(canvasAndContext: CanvasAndContext) {
		if (canvasAndContext.canvas) {
			canvasAndContext.canvas.width = 0;
			canvasAndContext.canvas.height = 0;
		}

		canvasAndContext.canvas = null;
		canvasAndContext.context = null;
	}
}

export class NoopFilterFactory {
	addFilter(): string {
		return "none";
	}
	addHCMFilter(): string {
		return "none";
	}
	addAlphaFilter(): string {
		return "none";
	}
	addLuminosityFilter(): string {
		return "none";
	}
	addKnockoutFilter(): string {
		return "none";
	}
	addHighlightHCMFilter(): string {
		return "none";
	}
	addSelectionHCMFilter(): string {
		return "none";
	}
	addSelectionFilter(): string {
		return "none";
	}
	createSelectionStyle(): null {
		return null;
	}
	destroy(): void {}
}

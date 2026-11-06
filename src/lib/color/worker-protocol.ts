// Messages between the page and the palette worker.

import type { PaletteColor } from "./palette.ts";

export interface PaletteWorkerRequest {
	readonly id: number;
	readonly buffer: ArrayBuffer;
	readonly mimeType: string;
}

export type PaletteWorkerResponse =
	| {
			readonly id: number;
			readonly ok: true;
			readonly colors: ReadonlyArray<PaletteColor>;
	  }
	| {
			readonly id: number;
			readonly ok: false;
			readonly reason: "empty" | "open" | "image";
			// The browser's own error text, when it gave one. The page words the
			// message, because a worker has no active locale.
			readonly detail?: string;
	  };

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
			readonly reason: "empty" | "image";
			readonly message: string;
	  };

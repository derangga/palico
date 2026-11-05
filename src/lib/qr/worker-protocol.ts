// Messages between the page and the QR decode worker.

import type { EccLevel } from "./tables.ts";

export type QrWorkerRequest =
	| {
			readonly type: "file";
			readonly id: number;
			readonly buffer: ArrayBuffer;
			readonly mimeType: string;
	  }
	| {
			readonly type: "frame";
			readonly id: number;
			readonly width: number;
			readonly height: number;
			readonly buffer: ArrayBuffer;
	  };

export type QrWorkerResponse =
	| {
			readonly id: number;
			readonly ok: true;
			readonly text: string;
			readonly version: number;
			readonly ecc: EccLevel;
	  }
	| {
			readonly id: number;
			readonly ok: false;
			readonly reason: "not-found" | "image";
			readonly message: string;
	  };

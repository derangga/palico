// Messages between the page and the converter worker.

import type { ConvertOptions } from "./types.ts";

export interface ConverterRequest {
	readonly text: string;
	readonly options: ConvertOptions;
}

/**
 * A failure as plain data. A class instance does not survive `postMessage`, so
 * the page rebuilds the tagged error from this. The message is already in the
 * request's language, because the request carried the message templates.
 */
export type ConverterFailure =
	| {
			readonly tag: "ParseError";
			readonly message: string;
			readonly format: "json" | "yaml" | "csv";
			readonly line: number;
			readonly column: number;
	  }
	| { readonly tag: "NotATableError"; readonly message: string }
	| {
			readonly tag: "InputTooLargeError";
			readonly message: string;
			readonly size: number;
			readonly limit: number;
	  }
	| { readonly tag: "Defect" };

export type ConverterResponse =
	| { readonly ok: true; readonly output: string }
	| { readonly ok: false; readonly failure: ConverterFailure };

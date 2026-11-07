// Shapes shared by everything that talks about a qpdf run. No runtime dependency on
// the qpdf glue code, so pure modules (command builders, result readers) and the
// page can import them freely. The runner itself is in run.ts.

// qpdf exits 0 on success and 3 when it succeeded with warnings (a damaged file it
// repaired, say). Anything else is a failure.
export const QPDF_OK_EXITS: ReadonlyArray<number> = [0, 3];

export interface QpdfStep {
	readonly args: ReadonlyArray<string>;
}

export interface QpdfInput {
	readonly path: string;
	readonly bytes: Uint8Array;
}

export interface QpdfStepResult {
	readonly exitCode: number;
	readonly stdout: ReadonlyArray<string>;
	readonly stderr: ReadonlyArray<string>;
}

export interface QpdfOutput {
	readonly path: string;
	readonly bytes: Uint8Array<ArrayBuffer>;
}

export interface QpdfRunResult {
	// One entry per step that ran. A failing step ends the run, so this can be
	// shorter than the list that was asked for.
	readonly steps: ReadonlyArray<QpdfStepResult>;
	// The requested output paths that exist after the run.
	readonly outputs: ReadonlyArray<QpdfOutput>;
}

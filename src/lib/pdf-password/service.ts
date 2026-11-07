import { Context, type Effect, Layer, Schema } from "effect";

import { QPDF_WASM_URL } from "#/lib/qpdf/assets.ts";
import { runInWorker } from "#/lib/qpdf/worker-client.ts";

import { type CryptError, toCryptError } from "./map-error.ts";
import { CryptDone, type CryptJob, type CryptRequest } from "./shapes.ts";

export interface CryptResult {
	readonly bytes: ArrayBuffer;
	readonly pageCount: number;
}

export interface PdfCryptApi {
	// Run one Protect or Unlock job on the PDF's bytes. The live layer below does it
	// in a worker; tests give a fake, so the same graph runs in node.
	readonly run: (params: {
		readonly fileName: string;
		readonly buffer: ArrayBuffer;
		readonly job: CryptJob;
	}) => Effect.Effect<CryptResult, CryptError>;
}

export class PdfCrypt extends Context.Service<PdfCrypt, PdfCryptApi>()(
	"palico/PdfCrypt",
) {}

const isCryptDone = Schema.is(CryptDone);

const secretsOf = (job: CryptJob): ReadonlyArray<string> =>
	job.mode === "protect"
		? [job.userPassword, job.ownerPassword]
		: [job.password];

// The live PdfCrypt: one fresh qpdf worker per job (see src/lib/qpdf/worker-client.ts).
// The password travels inside `job`, in the one request message, and the worker is
// terminated when the job ends.
export const PdfCryptLive = Layer.succeed(PdfCrypt, {
	run: ({ fileName, buffer, job }) => {
		const request: CryptRequest = {
			type: "crypt",
			id: crypto.randomUUID(),
			wasmUrl: QPDF_WASM_URL,
			buffer,
			job,
		};

		return runInWorker({
			request,
			transfer: [buffer],
			isDone: isCryptDone,
			secrets: secretsOf(job),
			toError: (failure) =>
				toCryptError(fileName, failure.reason, failure.detail),
		});
	},
});

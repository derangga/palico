// The worker's side of a `crypt` request, as a function that returns the message to
// post. The worker file only wires it to `postMessage`.

import {
	type Answer,
	type AnswerDeps,
	failureReason,
	messageOf,
} from "#/lib/qpdf/handle.ts";
import { runQpdf } from "#/lib/qpdf/run.ts";
import { scrub } from "#/lib/qpdf/scrub.ts";

import { executeCrypt, secretsOf, type VerifyRequest } from "./crypt.ts";
import type { CryptDone, CryptFailure, CryptRequest } from "./shapes.ts";

export const answerCrypt = async (
	request: CryptRequest,
	deps: AnswerDeps & {
		readonly verify: (request: VerifyRequest) => Promise<boolean>;
	},
): Promise<Answer<CryptDone | CryptFailure>> => {
	const secrets = secretsOf(request.job);

	let wasm: ArrayBuffer;

	try {
		wasm = await deps.loadWasm(request.wasmUrl);
	} catch (cause) {
		return {
			message: {
				type: "error",
				id: request.id,
				reason: "engine-load",
				detail: scrub(messageOf(cause), secrets),
			},
			transfer: [],
		};
	}

	try {
		const outcome = await executeCrypt(
			request.job,
			new Uint8Array(request.buffer),
			{
				runQpdf: (params) => runQpdf({ wasm, hooks: deps.hooks, ...params }),
				verify: deps.verify,
			},
		);

		if (outcome.ok) {
			return {
				message: {
					type: "crypt-done",
					id: request.id,
					bytes: outcome.bytes.buffer,
					pageCount: outcome.pageCount,
				},
				transfer: [outcome.bytes.buffer],
			};
		}

		return {
			message: {
				type: "error",
				id: request.id,
				reason: outcome.reason,
				detail: outcome.detail,
			},
			transfer: [],
		};
	} catch (cause) {
		return {
			message: {
				type: "error",
				id: request.id,
				reason: failureReason(cause),
				detail: scrub(messageOf(cause), secrets),
			},
			transfer: [],
		};
	}
};

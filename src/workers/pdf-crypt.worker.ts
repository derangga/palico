/// <reference lib="webworker" />
// Runs qpdf (WebAssembly) for the PDF password tool, and for any later tool that
// needs it. One job per worker: the page terminates the worker when the job ends, so
// a password held here dies with it. Nothing is logged or stored.
//
// Two requests:
//   crypt     Protect or Unlock one PDF, then re-open the output with pdf.js
//             (src/lib/pdf-password/answer.ts).
//   qpdf-run  Run any qpdf command lines on any files (src/lib/qpdf/handle.ts).
//
// The worker has no active language, so failures go back as reasons and the page
// words them (src/lib/pdf-password/map-error.ts).

import { GlobalWorkerOptions } from "pdfjs-dist";
// Vite emits pdf.js's parsing worker as an asset and hands us its URL. Same setup
// as pdf.worker.ts; nothing is fetched at runtime.
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { answerCrypt } from "#/lib/pdf-password/answer.ts";
import { reopenOutput } from "#/lib/pdf-password/reopen.ts";
import type {
	CryptDone,
	CryptFailure,
	CryptRequest,
} from "#/lib/pdf-password/shapes.ts";
import { type Answer, answerQpdfRun } from "#/lib/qpdf/handle.ts";
import type {
	QpdfFailure,
	QpdfRunDone,
	QpdfRunRequest,
} from "#/lib/qpdf/protocol.ts";
import { loadQpdfWasm } from "#/lib/qpdf/run.ts";

// This file runs as a dedicated worker; the DOM lib types `self` as Window.
declare const self: DedicatedWorkerGlobalScope;

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type Outgoing = CryptDone | CryptFailure | QpdfRunDone | QpdfFailure;

const post = ({ message, transfer }: Answer<Outgoing>) => {
	self.postMessage(message, [...transfer]);
};

// One job per worker. The glue's output is captured by swapping console methods while
// it starts (src/lib/qpdf/run.ts), and two jobs at once would nest that swap. The page
// never sends a second request; if one arrives anyway it is refused.
let started = false;

self.onmessage = (event: MessageEvent<CryptRequest | QpdfRunRequest>) => {
	const request = event.data;

	// Anything that is not one of our two requests (dev-tooling chatter) is not a job.
	if (request.type !== "crypt" && request.type !== "qpdf-run") return;

	if (started) {
		post({
			message: {
				type: "error",
				id: request.id,
				reason: "worker",
				detail: "This worker already has a job.",
			},
			transfer: [],
		});

		return;
	}

	started = true;

	const deps = { loadWasm: loadQpdfWasm };

	if (request.type === "crypt") {
		void answerCrypt(request, { ...deps, verify: reopenOutput }).then(post);
	} else {
		void answerQpdfRun(request, deps).then(post);
	}
};

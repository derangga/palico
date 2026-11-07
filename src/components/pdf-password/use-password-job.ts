import { Effect } from "effect";
import { useState } from "react";
import { toast } from "sonner";

import { downloadBlob } from "#/components/converter/utils.ts";
import { withBusy } from "#/lib/offline/busy.ts";
import type { JobOutcome } from "#/lib/pdf-password/outcome.ts";
import { type PdfCrypt, PdfCryptLive } from "#/lib/pdf-password/service.ts";
import { recordToolUse } from "#/lib/tool-history/store.ts";
import { m } from "#/paraglide/messages.js";

// Runs one Lock or Unlock job for a form and keeps what the page shows about it.
// `working` lives in the page, not here: the mode switch and "Choose another" are
// outside the form and must stay off while a job runs.
export function usePasswordJob({
	working,
	onWorkingChange,
	onEngineError,
}: {
	readonly working: boolean;
	readonly onWorkingChange: (working: boolean) => void;
	readonly onEngineError: (message: string) => void;
}) {
	const [outcome, setOutcome] = useState<JobOutcome>();

	const run = async (
		job: Effect.Effect<JobOutcome, never, PdfCrypt>,
		onDone: () => void,
	) => {
		if (working) return;

		onWorkingChange(true);
		setOutcome(undefined);

		let result: JobOutcome;

		try {
			result = await Effect.runPromise(
				withBusy(job).pipe(Effect.provide(PdfCryptLive)),
			);
		} catch {
			// The job maps its own failures and defects to an outcome, so only the
			// busy marker can reject here. The form must not stay stuck on "Working".
			result = { kind: "failed", message: m.pdfpw_error_unexpected() };
		} finally {
			onWorkingChange(false);
		}

		setOutcome(result);

		switch (result.kind) {
			case "done":
				// The file is made. Nothing needs the passwords any more, so they do not
				// stay in the page's memory.
				onDone();
				recordToolUse("/pdf-password");
				downloadBlob(result.blob, result.name);
				break;
			case "engine":
				onEngineError(result.message);
				break;
			case "failed":
				toast.error(result.message);
				break;
			default:
				break;
		}
	};

	return {
		outcome,
		clearOutcome: () => setOutcome(undefined),
		run,
		done: outcome?.kind === "done" ? outcome : undefined,
		fieldError: outcome?.kind === "field" ? outcome : undefined,
		blocked: outcome?.kind === "blocked" ? outcome.message : undefined,
	};
}

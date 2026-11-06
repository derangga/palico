import { useWorkerPool, WorkerPoolContextProvider } from "@pierre/diffs/react";
// Vite bundles the package's worker entry; `?worker` yields a Worker constructor.
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { Cause, Effect, Option, Exit } from "effect";
import { FileDiff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DIFF_THEME, DiffView } from "#/components/diff-view.tsx";
import { PageHeader, PageShell } from "#/components/page-shell.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { computeDiff, type DiffResult } from "#/lib/file/diff.ts";
import type { DiffLanguage } from "#/lib/file/types.ts";
import { m } from "#/paraglide/messages.js";

// Warm the singleton worker pool as soon as the workspace mounts so the first
// in-view language switch highlights without a cold-start stall. Idempotent;
// failure is non-fatal — the pool falls back to lazy init on the first task.
function PoolWarmup() {
	const pool = useWorkerPool();
	useEffect(() => {
		pool?.initialize().catch((cause) => console.error(cause));
	}, [pool]);

	return null;
}

// Everything below the route lives under a single, always-mounted
// WorkerPoolContextProvider. The provider owns a module-level singleton pool
// that terminates when its last instance unmounts, so it must NOT sit inside a
// view that toggles on/off (the old bug: Back unmounted it, and re-running the
// diff rendered an empty result against a torn-down pool).
export function DiffWorkspace() {
	// Language is chosen on the result screen, never on the input form. The diff
	// itself is line-based (jsdiff) and language-agnostic, so every diff starts as
	// plain text and the in-view LanguageSelect switches highlighting. This is
	// deliberate: @pierre/diffs drops a highlight task whose render options change
	// while it's in flight, which is exactly what happens on the very first diff
	// (the pool's options are still being set). Rendering plain first and letting
	// the selector re-highlight runs against a settled pool, so it always lands.
	const [language, setLanguage] = useState<DiffLanguage>("text");
	const [original, setOriginal] = useState("");
	const [changed, setChanged] = useState("");
	const [result, setResult] = useState<DiffResult | null>(null);
	const [running, setRunning] = useState(false);

	const canDiff = original.trim().length > 0 && changed.trim().length > 0;

	async function findDifference() {
		setRunning(true);

		const exit = await Effect.runPromiseExit(
			computeDiff({ original, changed, language: "text" }),
		);

		setRunning(false);

		if (Exit.isSuccess(exit)) {
			// Start every result plain so the selector acts as a re-highlight toggle.
			setLanguage("text");
			setResult(exit.value);

			return;
		}

		const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

		if (failure) console.error(failure);
		toast.error(failure?.message ?? m.diff_compute_failed());
	}

	return (
		<WorkerPoolContextProvider
			poolOptions={{
				workerFactory: () => new DiffsWorker(),
				poolSize: 2,
			}}
			highlighterOptions={{ lineDiffType: "word", theme: DIFF_THEME }}
		>
			<PoolWarmup />
			{result ? (
				<DiffView
					result={result}
					language={language}
					onLanguageChange={setLanguage}
					onBack={() => setResult(null)}
				/>
			) : (
				<PageShell width="full">
					<PageHeader title={m.diff_page_title()}>
						{m.diff_description()}
					</PageHeader>

					<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								{m.diff_original()}
							</span>
							<Textarea
								value={original}
								onChange={(e) => setOriginal(e.target.value)}
								placeholder={m.diff_placeholder_original()}
								spellCheck={false}
								className="h-[55vh] resize-none font-mono text-sm"
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								{m.diff_changed()}
							</span>
							<Textarea
								value={changed}
								onChange={(e) => setChanged(e.target.value)}
								placeholder={m.diff_placeholder_changed()}
								spellCheck={false}
								className="h-[55vh] resize-none font-mono text-sm"
							/>
						</div>
					</div>

					<div className="mt-6 flex justify-center">
						<Button onClick={findDifference} disabled={!canDiff || running}>
							{running ? <Loader2 className="animate-spin" /> : <FileDiff />}
							{m.diff_find()}
						</Button>
					</div>
				</PageShell>
			)}
		</WorkerPoolContextProvider>
	);
}

export default DiffWorkspace;

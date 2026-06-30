import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { FileDiff, Loader2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { toast } from "sonner";

import { LanguageSelect } from "#/components/language-select.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Textarea } from "#/components/ui/textarea.tsx";
import { computeDiff, type DiffResult } from "#/lib/file/diff.ts";
import type { DiffLanguage } from "#/lib/file/types.ts";

const DiffView = lazy(() => import("#/components/diff-view.tsx"));

export const Route = createFileRoute("/diff-viewer")({
	component: DiffViewerPage,
});

function DiffViewerPage() {
	const [language, setLanguage] = useState<DiffLanguage>("text");
	const [original, setOriginal] = useState("");
	const [changed, setChanged] = useState("");
	const [result, setResult] = useState<DiffResult | null>(null);
	const [running, setRunning] = useState(false);

	const canDiff = original.trim().length > 0 && changed.trim().length > 0;

	async function findDifference() {
		setRunning(true);
		const exit = await Effect.runPromiseExit(
			computeDiff({ original, changed, language }),
		);
		setRunning(false);
		if (exit._tag === "Success") {
			setResult(exit.value);
			return;
		}
		const failure = exit.cause._tag === "Fail" ? exit.cause.error : undefined;
		if (failure) console.error(failure);
		toast.error(failure?.message ?? "Couldn't compute the difference.");
	}

	if (result) {
		return (
			<Suspense
				fallback={
					<div className="flex min-h-[calc(100svh-3.5rem)] items-center justify-center">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				}
			>
				<DiffView
					result={result}
					language={language}
					onLanguageChange={setLanguage}
					onBack={() => setResult(null)}
				/>
			</Suspense>
		);
	}

	return (
		<div className="mx-auto w-full max-w-6xl px-6 py-10">
			<div className="mb-6">
				<h1 className="text-2xl font-bold">File Diff Viewer</h1>
				<p className="mt-1 text-sm text-muted-foreground">
					Paste your original and changed text side by side, then find the
					differences. Everything runs on your device — nothing is uploaded.
				</p>
			</div>

			<div className="mb-4 flex flex-col gap-1.5">
				<span className="text-xs font-medium text-muted-foreground">
					Language
				</span>
				<LanguageSelect value={language} onChange={setLanguage} />
			</div>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Original
					</span>
					<Textarea
						value={original}
						onChange={(e) => setOriginal(e.target.value)}
						placeholder="Paste the original text…"
						spellCheck={false}
						className="h-[55vh] resize-none font-mono text-sm"
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Changed
					</span>
					<Textarea
						value={changed}
						onChange={(e) => setChanged(e.target.value)}
						placeholder="Paste the changed text…"
						spellCheck={false}
						className="h-[55vh] resize-none font-mono text-sm"
					/>
				</div>
			</div>

			<div className="mt-6 flex justify-center">
				<Button onClick={findDifference} disabled={!canDiff || running}>
					{running ? <Loader2 className="animate-spin" /> : <FileDiff />}
					Find Difference
				</Button>
			</div>
		</div>
	);
}

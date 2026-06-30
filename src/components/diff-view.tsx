import {
	type FileContents,
	MultiFileDiff,
	WorkerPoolContextProvider,
} from "@pierre/diffs/react";
// Vite bundles the package's worker entry; `?worker` yields a Worker constructor.
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { FileCheck2, X } from "lucide-react";
import { useMemo } from "react";

import { LanguageSelect } from "#/components/language-select.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty.tsx";
import type { DiffResult } from "#/lib/file/diff.ts";
import type { DiffLanguage } from "#/lib/file/types.ts";

interface DiffViewProps {
	readonly result: DiffResult;
	readonly language: DiffLanguage;
	readonly onLanguageChange: (value: DiffLanguage) => void;
	readonly onBack: () => void;
}

// vitesse-light/dark are warm-toned Shiki themes that sit comfortably on the
// cream surface. Diff add/remove colors stay conventional — those are diff
// semantics, not the design system's destructive accent.
const DIFF_THEME = { light: "vitesse-light", dark: "vitesse-dark" } as const;

// A git-style proportional bar: up to 5 squares, additions first then
// deletions, the remainder muted. Each side that has any lines shows at least
// one square so a 1-line change never disappears.
function DiffStatBar({
	additions,
	deletions,
}: {
	additions: number;
	deletions: number;
}) {
	const total = additions + deletions;
	// total is always > 0 here (the bar only renders when there are changes).
	const greens =
		additions === 0
			? 0
			: Math.min(5, Math.max(1, Math.round((additions / total) * 5)));
	const reds = deletions === 0 ? 0 : 5 - greens;
	const muted = 5 - greens - reds;
	const squares = [
		...Array<"add">(greens).fill("add"),
		...Array<"del">(reds).fill("del"),
		...Array<"none">(muted).fill("none"),
	];
	return (
		<span className="flex items-center gap-0.5" aria-hidden>
			{squares.map((kind, i) => (
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length static bar
					key={i}
					className={
						kind === "add"
							? "size-2.5 rounded-xs bg-emerald-500"
							: kind === "del"
								? "size-2.5 rounded-xs bg-destructive"
								: "size-2.5 rounded-xs bg-muted"
					}
				/>
			))}
		</span>
	);
}

// In-page diff result: the route swaps the input form for this. The app sidebar
// and header stay; this fills the content area below the header.
export function DiffView({
	result,
	language,
	onLanguageChange,
	onBack,
}: DiffViewProps) {
	// Rebuild the file contents from the raw text with the live language so the
	// toolbar's language switch re-highlights without recomputing the diff.
	const oldFile = useMemo<FileContents>(
		() => ({
			name: "input",
			contents: result.oldFile.contents,
			lang: language,
		}),
		[result.oldFile.contents, language],
	);
	const newFile = useMemo<FileContents>(
		() => ({
			name: "input",
			contents: result.newFile.contents,
			lang: language,
		}),
		[result.newFile.contents, language],
	);

	return (
		<div className="flex min-h-[calc(100svh-3.5rem)] flex-col">
			<div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<span className="text-emerald-600 dark:text-emerald-500">
						+{result.additions}
					</span>
					<span className="text-destructive">−{result.deletions}</span>
					<DiffStatBar
						additions={result.additions}
						deletions={result.deletions}
					/>
				</div>
				<div className="flex items-center gap-2">
					<LanguageSelect value={language} onChange={onLanguageChange} />
					<Button variant="destructive" size="sm" onClick={onBack}>
						<X />
						Back
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-auto p-4 sm:p-6">
				{result.hasChanges ? (
					<div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
						<WorkerPoolContextProvider
							poolOptions={{
								workerFactory: () => new DiffsWorker(),
								poolSize: 2,
							}}
							highlighterOptions={{ lineDiffType: "word", theme: DIFF_THEME }}
						>
							<MultiFileDiff
								oldFile={oldFile}
								newFile={newFile}
								options={{
									diffStyle: "split",
									lineDiffType: "word",
									expandUnchanged: true,
									disableFileHeader: true,
									theme: DIFF_THEME,
								}}
							/>
						</WorkerPoolContextProvider>
					</div>
				) : (
					<Empty className="mx-auto max-w-md">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileCheck2 />
							</EmptyMedia>
							<EmptyTitle>No differences</EmptyTitle>
							<EmptyDescription>
								The original and changed text are identical. Go back and edit
								either side, then find the difference again.
							</EmptyDescription>
						</EmptyHeader>
						<Button variant="outline" onClick={onBack}>
							Back to editor
						</Button>
					</Empty>
				)}
			</div>
		</div>
	);
}

export default DiffView;

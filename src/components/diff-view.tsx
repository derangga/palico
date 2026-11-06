import { type FileContents, MultiFileDiff } from "@pierre/diffs/react";
import { FileCheck2, X } from "lucide-react";
import { useTheme } from "next-themes";
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
import { useIsMobile } from "#/hooks/use-mobile.ts";
import type { DiffResult } from "#/lib/file/diff.ts";
import type { DiffLanguage } from "#/lib/file/types.ts";
import { m } from "#/paraglide/messages.js";

interface DiffViewProps {
	readonly result: DiffResult;
	readonly language: DiffLanguage;
	readonly onLanguageChange: (value: DiffLanguage) => void;
	readonly onBack: () => void;
}

// The Catppuccin Shiki themes match the app flavours (Latte and Mocha), so the
// diff sits on the same base colour as the page. Shared with the workspace so
// the pool's highlighter and this renderer resolve the same themes.
export const DIFF_THEME = {
	light: "catppuccin-latte",
	dark: "catppuccin-mocha",
} as const;

// Add and remove lines are a success or destructive tint (the library mixes the
// base colour into the background). Line numbers sit on that tint, so they take
// the foreground colour to stay readable in Latte, where green is too light.
const DIFF_COLOR_VARS =
	"[--diffs-addition-color-override:var(--success)] [--diffs-deletion-color-override:var(--destructive)] [--diffs-fg-number-addition-override:var(--foreground)] [--diffs-fg-number-deletion-override:var(--foreground)]";

const SQUARE_FILL: Record<"add" | "del" | "none", string> = {
	add: "bg-success",
	del: "bg-destructive",
	none: "bg-muted",
};

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
		<span className="hidden items-center gap-0.5 sm:flex" aria-hidden>
			{squares.map((kind, i) => (
				<span
					// oxlint-disable-next-line react/no-array-index-key -- fixed-length static bar
					key={i}
					className={`size-2.5 rounded-xs ${SQUARE_FILL[kind]}`}
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
	const { resolvedTheme } = useTheme();
	// Two columns of about 170px are too narrow to read on a phone.
	const isMobile = useIsMobile();

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
			<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
				<div className="flex items-center gap-2 text-sm font-semibold">
					<span className="rounded-full bg-success/25 px-2 py-0.5 text-foreground">
						+{result.additions}
					</span>
					<span className="rounded-full bg-destructive/20 px-2 py-0.5 text-foreground">
						−{result.deletions}
					</span>
					<DiffStatBar
						additions={result.additions}
						deletions={result.deletions}
					/>
				</div>
				<div className="flex items-center gap-2">
					<LanguageSelect value={language} onChange={onLanguageChange} />
					<Button variant="destructive" size="sm" onClick={onBack}>
						<X />
						{m.diff_back()}
					</Button>
				</div>
			</div>

			<div className="flex-1 overflow-auto p-4 sm:p-6">
				{result.hasChanges ? (
					<div
						className={`overflow-hidden rounded-lg border border-border bg-background shadow-sm ${DIFF_COLOR_VARS}`}
					>
						<MultiFileDiff
							oldFile={oldFile}
							newFile={newFile}
							options={{
								diffStyle: isMobile ? "unified" : "split",
								lineDiffType: "word",
								expandUnchanged: true,
								disableFileHeader: true,
								theme: DIFF_THEME,
								themeType: resolvedTheme === "dark" ? "dark" : "light",
							}}
						/>
					</div>
				) : (
					<Empty className="mx-auto max-w-md">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FileCheck2 />
							</EmptyMedia>
							<EmptyTitle>{m.diff_none_title()}</EmptyTitle>
							<EmptyDescription>{m.diff_none_desc()}</EmptyDescription>
						</EmptyHeader>
						<Button variant="outline" onClick={onBack}>
							{m.diff_back_editor()}
						</Button>
					</Empty>
				)}
			</div>
		</div>
	);
}

export default DiffView;

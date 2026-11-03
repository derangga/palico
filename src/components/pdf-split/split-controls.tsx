import { Download, Loader2 } from "lucide-react";

import type { SplitMode } from "#/components/pdf-split/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/tabs.tsx";

interface SplitControlsProps {
	mode: SplitMode;
	onModeChange: (mode: SplitMode) => void;
	ready: boolean;
	working: boolean;
	selectedCount: number;
	pageCount: number;
	everyN: number;
	onEveryNChange: (value: number) => void;
	onClearSelected: () => void;
	onSelectAll: () => void;
	onExtract: () => void;
	onSplitEveryN: () => void;
	onSplitAll: () => void;
}

export function SplitControls({
	mode,
	onModeChange,
	ready,
	working,
	selectedCount,
	pageCount,
	everyN,
	onEveryNChange,
	onClearSelected,
	onSelectAll,
	onExtract,
	onSplitEveryN,
	onSplitAll,
}: SplitControlsProps) {
	const validEveryN = everyN >= 1 && everyN <= pageCount;
	const everyNFileCount = validEveryN ? Math.ceil(pageCount / everyN) : 0;

	return (
		<Tabs
			value={mode}
			onValueChange={(value) => onModeChange(value as SplitMode)}
		>
			<TabsList>
				<TabsTrigger value="extract">Extract pages</TabsTrigger>
				<TabsTrigger value="every-n">Every N pages</TabsTrigger>
				<TabsTrigger value="all">All pages</TabsTrigger>
			</TabsList>

			<TabsContent value="extract">
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<p className="text-sm text-muted-foreground">
						{selectedCount > 0 ? (
							<span className="font-medium text-foreground">
								{selectedCount} of {pageCount} selected
							</span>
						) : (
							"Click pages to select, then extract them into a new PDF."
						)}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={onClearSelected}
							disabled={!ready || selectedCount === 0}
						>
							Clear
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={onSelectAll}
							disabled={!ready || selectedCount === pageCount}
						>
							Select all
						</Button>
						<Button
							size="sm"
							onClick={onExtract}
							disabled={!ready || selectedCount === 0 || working}
						>
							{working ? <Loader2 className="animate-spin" /> : <Download />}
							Extract
						</Button>
					</div>
				</div>
			</TabsContent>

			<TabsContent value="every-n">
				<div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<div className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Pages per file
						</span>
						<Input
							type="number"
							min={1}
							max={pageCount}
							value={everyN}
							onChange={(e) =>
								onEveryNChange(
									Math.max(1, Math.floor(Number(e.target.value) || 1)),
								)
							}
							className="w-28"
						/>
						<span className="text-xs text-muted-foreground">
							{validEveryN
								? `Creates ${everyNFileCount} ${everyNFileCount === 1 ? "file" : "files"}, zipped.`
								: `Enter a number between 1 and ${pageCount}.`}
						</span>
					</div>
					<Button
						size="sm"
						onClick={onSplitEveryN}
						disabled={!ready || !validEveryN || working}
					>
						{working ? <Loader2 className="animate-spin" /> : <Download />}
						Split & download zip
					</Button>
				</div>
			</TabsContent>

			<TabsContent value="all">
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<p className="text-sm text-muted-foreground">
						Split every page into its own PDF:{" "}
						<span className="font-medium text-foreground">
							{pageCount} {pageCount === 1 ? "file" : "files"}
						</span>
						, bundled into one zip.
					</p>
					<Button size="sm" onClick={onSplitAll} disabled={!ready || working}>
						{working ? <Loader2 className="animate-spin" /> : <Download />}
						Split & download zip
					</Button>
				</div>
			</TabsContent>
		</Tabs>
	);
}

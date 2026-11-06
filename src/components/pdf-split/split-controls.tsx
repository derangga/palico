import { Schema } from "effect";
import { Download, Loader2 } from "lucide-react";

import { SplitMode } from "#/components/pdf-split/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "#/components/ui/tabs.tsx";
import { filesLabel } from "#/lib/i18n/counts.ts";
import { m } from "#/paraglide/messages.js";

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
			onValueChange={(value) => {
				if (Schema.is(SplitMode)(value)) onModeChange(value);
			}}
		>
			<TabsList>
				<TabsTrigger value="extract">{m.pdfsplit_tab_extract()}</TabsTrigger>
				<TabsTrigger value="every-n">{m.pdfsplit_tab_every_n()}</TabsTrigger>
				<TabsTrigger value="all">{m.pdfsplit_tab_all()}</TabsTrigger>
			</TabsList>

			<TabsContent value="extract">
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<p className="text-sm text-muted-foreground">
						{selectedCount > 0 ? (
							<span className="font-medium text-foreground">
								{m.pdfsplit_selected({
									selected: selectedCount,
									total: pageCount,
								})}
							</span>
						) : (
							m.pdfsplit_click_hint()
						)}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={onClearSelected}
							disabled={!ready || selectedCount === 0}
						>
							{m.common_clear()}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={onSelectAll}
							disabled={!ready || selectedCount === pageCount}
						>
							{m.pdfsplit_select_all()}
						</Button>
						<Button
							size="sm"
							onClick={onExtract}
							disabled={!ready || selectedCount === 0 || working}
						>
							{working ? <Loader2 className="animate-spin" /> : <Download />}
							{m.pdfsplit_extract()}
						</Button>
					</div>
				</div>
			</TabsContent>

			<TabsContent value="every-n">
				<div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<div className="flex flex-col gap-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{m.pdfsplit_pages_per_file()}
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
								? m.pdfsplit_creates({ files: filesLabel(everyNFileCount) })
								: m.pdfsplit_enter_number({ max: pageCount })}
						</span>
					</div>
					<Button
						size="sm"
						onClick={onSplitEveryN}
						disabled={!ready || !validEveryN || working}
					>
						{working ? <Loader2 className="animate-spin" /> : <Download />}
						{m.pdfsplit_split_zip()}
					</Button>
				</div>
			</TabsContent>

			<TabsContent value="all">
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
					<p className="text-sm text-muted-foreground">
						{m.pdfsplit_all_before()}{" "}
						<span className="font-medium text-foreground">
							{filesLabel(pageCount)}
						</span>
						{m.pdfsplit_all_after()}
					</p>
					<Button size="sm" onClick={onSplitAll} disabled={!ready || working}>
						{working ? <Loader2 className="animate-spin" /> : <Download />}
						{m.pdfsplit_split_zip()}
					</Button>
				</div>
			</TabsContent>
		</Tabs>
	);
}

import {
	Ban,
	Download,
	Film,
	Loader2,
	type LucideIcon,
	Scissors,
} from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import type { TrimOutput } from "#/components/video-cutter/state.ts";
import {
	downloadBlob,
	formatBytes,
	formatLabelFor,
	formatTime,
} from "#/components/video-cutter/utils.ts";

interface TrimPanelProps {
	file: File;
	// Label of the format row and the icon of the result card. The audio cutter
	// overrides both.
	formatTitle?: string;
	ResultIcon?: LucideIcon;
	outputDuration: number;
	trimming: boolean;
	cancelling: boolean;
	canProceed: boolean;
	output: TrimOutput | null;
	onCancel: () => void;
	onReset: () => void;
	onProceed: () => void;
}

export function TrimPanel({
	file,
	formatTitle = "Current video format",
	ResultIcon = Film,
	outputDuration,
	trimming,
	cancelling,
	canProceed,
	output,
	onCancel,
	onReset,
	onProceed,
}: TrimPanelProps) {
	return (
		<div className="flex flex-col gap-4 min-[769px]:sticky min-[769px]:top-20">
			<div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">{formatTitle}</span>
					<span className="text-sm font-medium">{formatLabelFor(file)}</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">Output duration</span>
					<span className="text-sm font-medium tabular-nums">
						{formatTime(outputDuration)}
					</span>
				</div>

				{trimming ? (
					<Button
						variant="outline"
						className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={onCancel}
						disabled={cancelling}
					>
						{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
						{cancelling ? "Cancelling…" : "Cancel"}
					</Button>
				) : (
					<Button variant="ghost" className="w-full" onClick={onReset}>
						Choose another
					</Button>
				)}

				<Button className="w-full" onClick={onProceed} disabled={!canProceed}>
					{trimming ? <Loader2 className="animate-spin" /> : <Scissors />}
					{trimming ? "Trimming…" : "Proceed"}
				</Button>
			</div>

			{output && (
				<div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 py-2.5">
					<ResultIcon className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{output.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatBytes(output.size)}
						</p>
					</div>
					<Button onClick={() => downloadBlob(output.blob, output.name)}>
						<Download />
						Save
					</Button>
				</div>
			)}
		</div>
	);
}

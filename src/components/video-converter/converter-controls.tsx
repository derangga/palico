import { Result } from "effect";
import { Ban, Loader2 } from "lucide-react";
import { useId } from "react";

import { Button } from "#/components/ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import {
	parseVideoOutputFormat,
	VIDEO_OUTPUT_FORMATS,
	type VideoOutputFormat,
} from "#/lib/video/types.ts";

interface ConverterControlsProps {
	format: VideoOutputFormat;
	onChangeFormat: (format: VideoOutputFormat) => void;
	isRunning: boolean;
	cancelling: boolean;
	convertLabel: string;
	convertDisabled: boolean;
	onCancelClick: () => void;
	onClear: () => void;
	onConvert: () => void;
}

export function ConverterControls({
	format,
	onChangeFormat,
	isRunning,
	cancelling,
	convertLabel,
	convertDisabled,
	onCancelClick,
	onClear,
	onConvert,
}: ConverterControlsProps) {
	const formatLabelId = useId();

	return (
		<div className="mt-6 flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
			<div className="flex flex-col gap-1.5">
				<span
					id={formatLabelId}
					className="text-xs font-medium text-muted-foreground"
				>
					Convert to
				</span>
				<Select
					value={format}
					onValueChange={(value) => {
						const parsed = parseVideoOutputFormat(value);

						if (Result.isSuccess(parsed)) onChangeFormat(parsed.success);
					}}
					disabled={isRunning}
				>
					<SelectTrigger className="w-32" aria-labelledby={formatLabelId}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{VIDEO_OUTPUT_FORMATS.map((f) => (
							<SelectItem key={f.value} value={f.value}>
								{f.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="ml-auto flex gap-2">
				{isRunning ? (
					<Button
						variant="outline"
						onClick={onCancelClick}
						disabled={cancelling}
						className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
					>
						{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
						{cancelling ? "Cancelling…" : "Cancel"}
					</Button>
				) : (
					<Button variant="ghost" onClick={onClear}>
						Clear
					</Button>
				)}
				<Button onClick={onConvert} disabled={convertDisabled}>
					{isRunning ? <Loader2 className="animate-spin" /> : null}
					{convertLabel}
				</Button>
			</div>
		</div>
	);
}

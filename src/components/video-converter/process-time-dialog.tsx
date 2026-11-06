import { Clock } from "lucide-react";
import { useId } from "react";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog.tsx";
import { Checkbox } from "#/components/ui/checkbox.tsx";
import type { Item } from "#/components/video-converter/types.ts";
import { estimateMinutes, MB } from "#/lib/video/limits.ts";
import {
	VIDEO_OUTPUT_FORMATS,
	type VideoOutputFormat,
} from "#/lib/video/types.ts";
import { m } from "#/paraglide/messages.js";

interface ProcessTimeDialogProps {
	pending: Item[] | null;
	format: VideoOutputFormat;
	dontShowAgain: boolean;
	onDontShowAgainChange: (value: boolean) => void;
	onCancel: () => void;
	onConfirm: () => void;
}

export function ProcessTimeDialog({
	pending,
	format,
	dontShowAgain,
	onDontShowAgainChange,
	onCancel,
	onConfirm,
}: ProcessTimeDialogProps) {
	const checkboxId = useId();
	const largest = pending ? Math.max(...pending.map((t) => t.file.size)) : 0;
	// Files ≥50MB always warn — the checkbox can't suppress them, so hide it.
	const suppressible = largest < 50 * MB;
	const minutes = estimateMinutes(largest, format);

	const formatLabel =
		VIDEO_OUTPUT_FORMATS.find((f) => f.value === format)?.label ??
		format.toUpperCase();

	return (
		<AlertDialog
			open={pending !== null}
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>
						<Clock />
					</AlertDialogMedia>
					<AlertDialogTitle>{m.videoconv_time_title()}</AlertDialogTitle>
					<AlertDialogDescription>
						{m.videoconv_time_description({
							mb: Math.round(largest / MB),
							format: formatLabel,
							duration:
								minutes === 1
									? m.duration_about_a_minute()
									: m.duration_about_minutes({ minutes }),
						})}
					</AlertDialogDescription>
				</AlertDialogHeader>
				{suppressible && (
					<label
						htmlFor={checkboxId}
						className="flex items-center gap-2 text-sm text-muted-foreground"
					>
						<Checkbox
							id={checkboxId}
							checked={dontShowAgain}
							onCheckedChange={(checked) =>
								onDontShowAgainChange(checked === true)
							}
						/>
						{m.videoconv_time_suppress()}
					</label>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						{m.videoconv_convert_anyway()}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

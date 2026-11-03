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
					<AlertDialogTitle>This one will take a few minutes</AlertDialogTitle>
					<AlertDialogDescription>
						This file is ~{Math.round(largest / MB)} MB. Converting to{" "}
						{formatLabel} typically takes{" "}
						{minutes === 1 ? "about a minute" : `~${minutes} minutes`} on this
						hardware. Everything runs on your device. Please keep this tab open.
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
						Don&apos;t show this again for files under 50 MB
					</label>
				)}
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						Convert anyway
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

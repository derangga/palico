import { Ban } from "lucide-react";

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

export function CancelDialog({
	open,
	onOpenChange,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>
						<Ban />
					</AlertDialogMedia>
					<AlertDialogTitle>Cancel conversion?</AlertDialogTitle>
					<AlertDialogDescription>
						The current file and any remaining files in the queue will not be
						converted. Videos you&apos;ve already downloaded stay available.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep converting</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						<Ban />
						Cancel conversion
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

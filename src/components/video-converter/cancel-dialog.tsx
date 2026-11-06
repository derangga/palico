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
import { m } from "#/paraglide/messages.js";

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
					<AlertDialogTitle>{m.videoconv_cancel_title()}</AlertDialogTitle>
					<AlertDialogDescription>
						{m.videoconv_cancel_description()}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{m.videoconv_keep_converting()}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onConfirm}>
						<Ban />
						{m.videoconv_cancel_action()}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

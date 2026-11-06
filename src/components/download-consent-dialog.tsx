import { Download } from "lucide-react";
import type { ReactNode } from "react";

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

export interface DownloadConsentDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onConfirm: () => void;
	readonly icon: ReactNode;
	readonly title: ReactNode;
	readonly description: ReactNode;
	readonly cancelLabel?: string;
	readonly confirmLabel?: string;
}

// Shared consent gate for the one-time, large on-device asset downloads (the
// video engine and the background-removal model). Both features front their
// download with the same dialog; only the icon/title/copy differ.
export function DownloadConsentDialog({
	open,
	onOpenChange,
	onConfirm,
	icon,
	title,
	description,
	cancelLabel = m.consent_cancel(),
	confirmLabel = m.consent_confirm(),
}: DownloadConsentDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>{icon}</AlertDialogMedia>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						<Download />
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

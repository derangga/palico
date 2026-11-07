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
import { useStore } from "#/hooks/use-offline-status.ts";
import { ShellState } from "#/lib/offline/shapes.ts";
import { shellStore } from "#/lib/offline/stores.ts";
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
	// A downloaded engine is useless offline without the app shell, and the download
	// turns offline on (guardedEngineLoad). Say so while it is off or a failed
	// attempt can be retried.
	const shell = useStore(shellStore);
	const shellOff =
		ShellState.guards.Off(shell) || ShellState.guards.Failed(shell);

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>{icon}</AlertDialogMedia>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>
						{description}
						{shellOff && (
							<span className="mt-2 block">{m.consent_also_offline()}</span>
						)}
					</AlertDialogDescription>
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

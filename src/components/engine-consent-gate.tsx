// Pieces shared by the three download gates (video engine, office engine,
// background-removal model). While the cache check runs we show a compact
// skeleton; when nothing is cached we show the inline "Enable" card, and the
// blocking consent dialog opens only when the user clicks Enable.

import type { LucideIcon } from "lucide-react";
import { Download } from "lucide-react";
import { type ReactNode, useState } from "react";

import { DownloadConsentDialog } from "#/components/download-consent-dialog.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { m } from "#/paraglide/messages.js";

export function EngineCheckingSkeleton() {
	return (
		<output
			aria-label={m.engine_checking_label()}
			className="flex items-center gap-3 rounded-xl border bg-card p-6"
		>
			<Skeleton className="size-5 shrink-0 rounded-full" />
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-40" />
				<Skeleton className="h-3 w-56 max-w-full" />
			</div>
		</output>
	);
}

interface EngineConsentCardProps {
	icon: LucideIcon;
	title: string;
	body: string;
	enableLabel: string;
	dialogTitle: string;
	dialogDescription: ReactNode;
	onConfirm: () => void;
}

export function EngineConsentCard({
	icon: Icon,
	title,
	body,
	enableLabel,
	dialogTitle,
	dialogDescription,
	onConfirm,
}: EngineConsentCardProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<div className="rounded-xl border border-dashed bg-card p-8 text-center">
				<Icon className="mx-auto size-8 text-muted-foreground" />
				<p className="mt-3 text-sm font-medium">{title}</p>
				<p className="mt-1 text-sm text-muted-foreground">{body}</p>
				<Button className="mt-4" onClick={() => setOpen(true)}>
					<Download />
					{enableLabel}
				</Button>
			</div>
			<DownloadConsentDialog
				open={open}
				onOpenChange={setOpen}
				onConfirm={() => {
					setOpen(false);
					onConfirm();
				}}
				icon={<Icon />}
				title={dialogTitle}
				description={dialogDescription}
			/>
		</>
	);
}

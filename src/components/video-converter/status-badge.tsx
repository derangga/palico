import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";

import type { ItemStatus } from "#/components/video-converter/types.ts";

export function StatusBadge({ status }: { status: ItemStatus }) {
	if (status === "processing")
		return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />;
	if (status === "done")
		return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
	if (status === "error")
		return <CircleAlert className="size-4 shrink-0 text-destructive" />;
	return null;
}

import { StatusPill } from "#/components/status-pill.tsx";
import type { ItemStatus } from "#/components/video-converter/types.ts";

export function StatusBadge({
	status,
	celebrate,
}: {
	status: ItemStatus;
	celebrate?: boolean;
}) {
	if (status === "processing") return <StatusPill state="working" />;
	if (status === "done")
		return <StatusPill state="done" celebrate={celebrate} />;
	if (status === "error") return <StatusPill state="failed" />;
	return null;
}

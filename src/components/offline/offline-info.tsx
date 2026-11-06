import { Effect } from "effect";
import { useEffect, useState } from "react";

import {
	OfflinePill,
	offlineLabel,
} from "#/components/offline/offline-pill.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { useOfflineStatus } from "#/hooks/use-offline-status.ts";
import { StorageHost } from "#/lib/offline/hosts.ts";
import { needsHomeScreenHint } from "#/lib/offline/platform.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { type EngineId, OfflineStatus } from "#/lib/offline/shapes.ts";
import { m } from "#/paraglide/messages.js";

const explain = (status: OfflineStatus): string =>
	OfflineStatus.match(status, {
		Ready: () => m.offline_explain_ready(),
		Preparing: () => m.offline_explain_preparing(),
		NeedsDownload: () => m.offline_explain_needs_download(),
		NotSaved: () => m.offline_explain_not_saved(),
		Unavailable: () => m.offline_explain_unavailable(),
	});

/** Tool header pill that opens a short explanation, storage state and install hint. */
export function OfflineInfo({ engine }: { engine?: EngineId }) {
	const status = useOfflineStatus(engine);
	const [open, setOpen] = useState(false);
	const [persisted, setPersisted] = useState<boolean | undefined>();

	// Only read while open, so the server render never touches navigator.
	const homeHint =
		open &&
		needsHomeScreenHint({
			userAgent: navigator.userAgent,
			maxTouchPoints: navigator.maxTouchPoints,
			standalone: window.matchMedia("(display-mode: standalone)").matches,
		});

	useEffect(() => {
		if (!open) return;
		void offlineRuntime
			.runPromise(StorageHost.pipe(Effect.flatMap((s) => s.persisted)))
			.then(setPersisted);
	}, [open]);

	if (!status) return null;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label={m.offline_info_aria({ status: offlineLabel(status) })}
				className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<OfflinePill status={status} />
			</PopoverTrigger>
			<PopoverContent>
				<p>{explain(status)}</p>
				{persisted !== undefined &&
					!OfflineStatus.guards.Unavailable(status) && (
						<p className="mt-2 text-xs text-muted-foreground">
							{persisted ? m.offline_persisted_yes() : m.offline_persisted_no()}
						</p>
					)}
				{homeHint && (
					<p className="mt-2 text-xs text-muted-foreground">
						{m.offline_home_hint()}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

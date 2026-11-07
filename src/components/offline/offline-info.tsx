import { Effect } from "effect";
import { useEffect, useState } from "react";

import {
	disableOffline,
	enableOffline,
} from "#/components/offline/offline-actions.ts";
import {
	OfflinePill,
	offlineLabel,
} from "#/components/offline/offline-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover.tsx";
import { useOfflineStatus, useStore } from "#/hooks/use-offline-status.ts";
import { StorageHost } from "#/lib/offline/hosts.ts";
import { needsHomeScreenHint } from "#/lib/offline/platform.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import {
	type EngineId,
	OfflineStatus,
	ShellState,
} from "#/lib/offline/shapes.ts";
import { shellStore } from "#/lib/offline/stores.ts";
import { m } from "#/paraglide/messages.js";

const explain = (status: OfflineStatus): string =>
	OfflineStatus.match(status, {
		Off: () => m.offline_explain_off(),
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
	const [stopping, setStopping] = useState(false);
	// The worker is on: the only time there is something to stop.
	const shell = useStore(shellStore);
	const shellActive = ShellState.guards.Active(shell);
	const failed = ShellState.guards.Failed(shell);

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
				{OfflineStatus.guards.Off(status) && (
					<p className="mb-1 font-semibold">{m.offline_explain_off_title()}</p>
				)}
				<p>{failed ? m.offline_explain_failed() : explain(status)}</p>
				{failed && (
					<Button
						className="mt-3 w-full"
						size="sm"
						variant="outline"
						onClick={enableOffline}
					>
						{m.offline_retry_action()}
					</Button>
				)}
				{OfflineStatus.guards.Off(status) && (
					<Button className="mt-3 w-full" size="sm" onClick={enableOffline}>
						{m.offline_save_action()}
					</Button>
				)}
				{persisted !== undefined &&
					!OfflineStatus.guards.Off(status) &&
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
				{shellActive && (
					<div className="mt-3 border-t border-border pt-2">
						<Button
							variant="ghost"
							size="xs"
							className="text-muted-foreground"
							disabled={stopping}
							onClick={() => {
								setStopping(true);
								void disableOffline().finally(() => setStopping(false));
							}}
						>
							{m.offline_stop_action()}
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

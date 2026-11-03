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
import type { EngineId } from "#/lib/offline/shapes.ts";

const EXPLAIN = {
	Ready:
		"This tool runs without a connection. Your files never leave your device.",
	Preparing:
		"Palico is saving the app to this device. This takes a moment on the first visit.",
	NeedsDownload:
		"Download this tool's engine once and it keeps working without a connection.",
	NotSaved:
		"The download finished, but this browser did not keep it. It will need to download again next time.",
	Unavailable: "This browser cannot save Palico for offline use.",
} as const;

/** Tool header pill that opens a short explanation, storage state and install hint. */
export function OfflineInfo({ engine }: { engine?: EngineId }) {
	const status = useOfflineStatus(engine);
	const [open, setOpen] = useState(false);
	const [persisted, setPersisted] = useState<boolean | undefined>();
	const [homeHint, setHomeHint] = useState(false);

	useEffect(() => {
		if (!open) return;
		setHomeHint(
			needsHomeScreenHint({
				userAgent: navigator.userAgent,
				maxTouchPoints: navigator.maxTouchPoints,
				standalone: window.matchMedia("(display-mode: standalone)").matches,
			}),
		);
		void offlineRuntime
			.runPromise(StorageHost.pipe(Effect.flatMap((s) => s.persisted)))
			.then(setPersisted);
	}, [open]);

	if (!status) return null;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				aria-label={`${offlineLabel(status)}. More about offline use`}
				className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				<OfflinePill status={status} />
			</PopoverTrigger>
			<PopoverContent>
				<p>{EXPLAIN[status._tag]}</p>
				{persisted !== undefined && status._tag !== "Unavailable" && (
					<p className="mt-2 text-xs text-muted-foreground">
						{persisted
							? "Your browser has agreed to keep saved files."
							: "Your browser may clear saved files when space runs low."}
					</p>
				)}
				{homeHint && (
					<p className="mt-2 text-xs text-muted-foreground">
						Add Palico to your Home Screen to keep tools offline on this device.
						Safari clears website data after 7 days without a visit.
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}

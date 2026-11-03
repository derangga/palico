import { Effect, SubscriptionRef } from "effect";
import { useEffect } from "react";
import { toast } from "sonner";

import { useStore } from "#/hooks/use-offline-status.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { reloadNeededRef } from "#/lib/offline/state.ts";
import {
	busyStore,
	reloadNeededStore,
	updateStore,
} from "#/lib/offline/stores.ts";
import { applyUpdate } from "#/lib/offline/update.ts";

const UPDATE_ID = "palico-update";
const RELOAD_ID = "palico-reload";

const runUpdate = () =>
	offlineRuntime.runPromise(
		applyUpdate.pipe(
			Effect.catchTags({
				UpdateBlockedError: (e) => Effect.sync(() => toast.message(e.message)),
				SwUpdateError: () =>
					Effect.sync(() =>
						toast.error("Reload to finish updating", {
							description: "The new version is ready after a manual reload.",
						}),
					),
			}),
		),
	);

/**
 * Shows "a new version is ready" when a worker is waiting. The action only
 * appears when no job is running, and nothing here reloads on its own.
 * Also covers old tabs whose lazy chunks vanished after an update elsewhere.
 */
export function UpdatePrompt() {
	const update = useStore(updateStore);
	const busy = useStore(busyStore);
	const reloadNeeded = useStore(reloadNeededStore);

	useEffect(() => {
		if (update === "idle") {
			toast.dismiss(UPDATE_ID);

			return;
		}

		const canApply = busy === 0 && update === "waiting";
		toast.info("A new version is ready", {
			id: UPDATE_ID,
			duration: Number.POSITIVE_INFINITY,
			description: canApply
				? "Files you haven't saved will be lost when the page reloads."
				: "You can update once the current job finishes.",
			action: canApply
				? { label: "Update", onClick: () => void runUpdate() }
				: undefined,
		});
	}, [update, busy]);

	useEffect(() => {
		if (!reloadNeeded) return;
		toast.warning("Reload to continue", {
			id: RELOAD_ID,
			duration: Number.POSITIVE_INFINITY,
			description: "A newer version was installed in another tab.",
			action: { label: "Reload", onClick: () => location.reload() },
		});
	}, [reloadNeeded]);

	// A lazy chunk of an old build failed to load: the same "reload" state.
	useEffect(() => {
		const onPreloadError = (event: Event) => {
			event.preventDefault();
			Effect.runSync(SubscriptionRef.set(reloadNeededRef, true));
		};

		window.addEventListener("vite:preloadError", onPreloadError);

		return () =>
			window.removeEventListener("vite:preloadError", onPreloadError);
	}, []);

	return null;
}

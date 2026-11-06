import { Effect, SubscriptionRef } from "effect";
import { useEffect } from "react";
import { toast } from "sonner";

import { useLocale } from "#/hooks/use-locale.ts";
import { useStore } from "#/hooks/use-offline-status.ts";
import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { reloadNeededRef } from "#/lib/offline/state.ts";
import {
	busyStore,
	reloadNeededStore,
	updateStore,
} from "#/lib/offline/stores.ts";
import { applyUpdate } from "#/lib/offline/update.ts";
import { m } from "#/paraglide/messages.js";

const UPDATE_ID = "palico-update";
const RELOAD_ID = "palico-reload";

const runUpdate = () =>
	offlineRuntime.runPromise(
		applyUpdate.pipe(
			Effect.catchTags({
				UpdateBlockedError: (e) => Effect.sync(() => toast.message(e.message)),
				SwUpdateError: () =>
					Effect.sync(() =>
						toast.error(m.update_failed_title(), {
							description: m.update_failed_description(),
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
	// A toast keeps the language it was raised in, so raise it again on a switch.
	const locale = useLocale();

	useEffect(() => {
		if (update === "idle") {
			toast.dismiss(UPDATE_ID);

			return;
		}

		const canApply = busy === 0 && update === "waiting";
		toast.info(m.update_ready_title(), {
			id: UPDATE_ID,
			duration: Number.POSITIVE_INFINITY,
			description: canApply ? m.update_ready_apply() : m.update_ready_wait(),
			action: canApply
				? { label: m.update_action(), onClick: () => void runUpdate() }
				: undefined,
		});
	}, [update, busy, locale]);

	useEffect(() => {
		if (!reloadNeeded) return;
		toast.warning(m.update_reload_title(), {
			id: RELOAD_ID,
			duration: Number.POSITIVE_INFINITY,
			description: m.update_reload_description(),
			action: {
				label: m.update_reload_action(),
				onClick: () => location.reload(),
			},
		});
	}, [reloadNeeded, locale]);

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

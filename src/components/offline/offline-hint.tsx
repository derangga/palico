import { useEffect } from "react";
import { toast } from "sonner";

import { enableOffline } from "#/components/offline/offline-actions.ts";
import { ShellState } from "#/lib/offline/shapes.ts";
import { shellStore } from "#/lib/offline/stores.ts";
import { m } from "#/paraglide/messages.js";

const HINT_KEY = "palico-offline-hint";

// "Shown once on this device." Storage can throw (private mode, blocked data), so
// every access is guarded. When it fails the hint may show again; that is better
// than never showing it or crashing.
const alreadyShown = () => {
	try {
		return localStorage.getItem(HINT_KEY) !== null;
	} catch {
		return false;
	}
};

const markShown = () => {
	try {
		localStorage.setItem(HINT_KEY, "1");
	} catch {
		// Not remembered; see above.
	}
};

// Saving the app needs a connection, so the action waits for one: it runs at once
// when the browser is online, and otherwise on the next `online` event.
const saveWhenOnline = () => {
	if (navigator.onLine) {
		enableOffline();

		return;
	}

	window.addEventListener("online", enableOffline, { once: true });
};

/**
 * The first time the connection drops while offline use is off, say what still
 * works and offer to save the app once the connection is back. Once per device.
 */
export function OfflineHint() {
	useEffect(() => {
		const onOffline = () => {
			if (!ShellState.guards.Off(shellStore.get()) || alreadyShown()) return;
			markShown();
			toast.info(m.offline_hint_title(), {
				id: HINT_KEY,
				description: m.offline_hint_description(),
				duration: 12_000,
				action: { label: m.offline_hint_action(), onClick: saveWhenOnline },
			});
		};

		window.addEventListener("offline", onOffline);

		return () => window.removeEventListener("offline", onOffline);
	}, []);

	return null;
}

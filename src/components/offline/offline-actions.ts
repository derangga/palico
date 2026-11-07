import { Effect } from "effect";
import { toast } from "sonner";

import { offlineRuntime } from "#/lib/offline/runtime.ts";
import { requestOffline, stopOffline } from "#/lib/offline/toggle.ts";
import { m } from "#/paraglide/messages.js";

// The two things a person can do about offline use. Shared by the pill popover
// and the one-time hint toast, so the wiring lives in one place.

/** Turn offline on. A no-op when it is already on or starting. */
export const enableOffline = () => {
	void Effect.runPromise(requestOffline);
};

/** Turn offline off. Failures show an error toast; nothing else to handle. */
export const disableOffline = () =>
	offlineRuntime.runPromise(
		stopOffline.pipe(
			Effect.catchTags({
				SwDisableError: () => Effect.sync(showStopFailed),
				OfflineCacheError: () => Effect.sync(showStopFailed),
			}),
		),
	);

const showStopFailed = () =>
	toast.error(m.offline_stop_failed_title(), {
		description: m.offline_stop_failed_description(),
	});

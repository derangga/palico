import { ManagedRuntime } from "effect";

import { LocaleHostLive } from "./hosts.ts";

// One runtime for the page, like lib/offline/runtime.ts.
export const localeRuntime = ManagedRuntime.make(LocaleHostLive);

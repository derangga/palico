// The active locale, page-wide. A module-level ref, like the offline state in
// lib/offline/state.ts. Paraglide's `m.*()` functions read it through
// `overwriteGetLocale` below, so every translated string follows this one value.
//
// The ref starts at the base locale on the server and on the first client render,
// so the prerendered shell and hydration agree. The real locale arrives after
// mount (see the layout effect in routes/__root.tsx).

import { Effect, SubscriptionRef } from "effect";

import { toStore } from "#/lib/offline/state.ts";
import { overwriteGetLocale } from "#/paraglide/runtime.js";

import { BASE_LOCALE, type Locale } from "./shapes.ts";

export const localeRef = Effect.runSync(
	SubscriptionRef.make<Locale>(BASE_LOCALE),
);

export const localeStore = toStore(localeRef);

/** The active locale, for code outside React (Intl formatting, error messages). */
export const currentLocale = (): Locale => localeStore.get();

// Every module that builds a message imports this file first (directly or through
// the root route), so the override is in place before the first `m.*()` call.
overwriteGetLocale(currentLocale);

export const resetLocale = Effect.asVoid(
	SubscriptionRef.set(localeRef, BASE_LOCALE),
);

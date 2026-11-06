// The browser surfaces the locale layer touches, as one Effect service. The real
// one wraps localStorage, navigator.languages and the <html> element; tests
// provide a fake, so the same graph runs in node.

import { Context, Effect, Layer, Option } from "effect";

import { LocaleStorageError } from "./errors.ts";
import type { Locale } from "./shapes.ts";

export const STORAGE_KEY = "palico:locale";

export interface LocaleHostApi {
	/** The raw stored string. Untrusted: decode it before use. */
	readonly readStored: Effect.Effect<Option.Option<string>, LocaleStorageError>;
	readonly write: (locale: Locale) => Effect.Effect<void, LocaleStorageError>;
	/** `navigator.languages`, most preferred first. Empty when the browser reports none. */
	readonly languages: Effect.Effect<ReadonlyArray<string>>;
	/** Keeps `<html lang>` in step so screen readers pick the right voice. */
	readonly applyToDocument: (locale: Locale) => Effect.Effect<void>;
}

export class LocaleHost extends Context.Service<LocaleHost, LocaleHostApi>()(
	"palico/LocaleHost",
) {}

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

export const LocaleHostLive = Layer.succeed(LocaleHost, {
	readStored: Effect.try({
		try: () => Option.fromNullishOr(localStorage.getItem(STORAGE_KEY)),
		catch: (cause) =>
			new LocaleStorageError({ operation: "read", message: messageOf(cause) }),
	}),
	write: (locale) =>
		Effect.try({
			try: () => localStorage.setItem(STORAGE_KEY, locale),
			catch: (cause) =>
				new LocaleStorageError({
					operation: "write",
					message: messageOf(cause),
				}),
		}),
	languages: Effect.sync(() =>
		typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [])],
	),
	applyToDocument: (locale) =>
		Effect.sync(() => {
			if (typeof document !== "undefined") {
				document.documentElement.lang = locale;
			}
		}),
});

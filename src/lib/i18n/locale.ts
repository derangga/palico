import { Effect, Option, Schema, SubscriptionRef } from "effect";

import { LocaleHost } from "./hosts.ts";
import {
	BASE_LOCALE,
	Locale,
	type LocaleSource,
	type ResolvedLocale,
} from "./shapes.ts";
import { localeRef } from "./state.ts";

const decodeStored = Schema.decodeUnknownOption(Locale);

// Older Android browsers report Indonesian as "in"; everything else matches on the
// primary subtag, so "id-ID" and "en-GB" find "id" and "en".
const LEGACY_CODES: ReadonlyMap<string, string> = new Map([["in", "id"]]);

/**
 * The first browser language this app has a translation for, or None. Pure, so it
 * is tested without a browser.
 */
export function matchLanguages(
	languages: ReadonlyArray<string>,
): Option.Option<Locale> {
	for (const tag of languages) {
		const primary = tag.toLowerCase().split("-")[0] ?? "";

		const match = decodeStored(LEGACY_CODES.get(primary) ?? primary);

		if (Option.isSome(match)) return match;
	}

	return Option.none();
}

// A saved choice, if one exists and is still a language we ship. A throwing read
// and a value we no longer ship both read as "nothing saved".
const stored = Effect.gen(function* () {
	const host = yield* LocaleHost;
	const raw = yield* host.readStored;

	return Option.flatMap(raw, decodeStored);
}).pipe(Effect.orElseSucceed(() => Option.none<Locale>()));

const detected = Effect.gen(function* () {
	const host = yield* LocaleHost;
	const languages = yield* host.languages;

	return matchLanguages(languages);
});

const publish = (locale: Locale) =>
	Effect.gen(function* () {
		const host = yield* LocaleHost;

		yield* SubscriptionRef.set(localeRef, locale);
		yield* host.applyToDocument(locale);
	});

/**
 * Saved choice, else browser language, else English. Sets the active locale and
 * the <html lang>. Never fails: every bad input has a fallback.
 */
export const resolveLocale: Effect.Effect<ResolvedLocale, never, LocaleHost> =
	Effect.gen(function* () {
		const saved = yield* stored;

		if (Option.isSome(saved))
			return { locale: saved.value, source: "stored" } as const;

		const browser = yield* detected;

		const source: LocaleSource = Option.isSome(browser) ? "browser" : "default";

		return { locale: Option.getOrElse(browser, () => BASE_LOCALE), source };
	}).pipe(Effect.tap((resolved) => publish(resolved.locale)));

/**
 * The person picked a language. The UI changes first, then the choice is saved,
 * so a storage that refuses the write still gives them the language for this
 * visit. A value that is not one of our locales is ignored.
 */
export const changeLocale = (
	value: string,
): Effect.Effect<void, never, LocaleHost> =>
	Effect.gen(function* () {
		const host = yield* LocaleHost;
		const picked = decodeStored(value);

		if (Option.isNone(picked)) return;

		yield* publish(picked.value);
		yield* host.write(picked.value);
	}).pipe(Effect.catchTag("LocaleStorageError", () => Effect.void));

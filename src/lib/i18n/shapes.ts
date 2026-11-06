import { Schema } from "effect";

import { baseLocale, locales } from "#/paraglide/runtime.js";

// The locales come from project.inlang/settings.json through the compiled
// runtime, so adding a language there is the only edit this file needs.
export const Locale = Schema.Literals(locales);

export type Locale = typeof Locale.Type;

export const BASE_LOCALE: Locale = baseLocale;

export const LOCALES: ReadonlyArray<Locale> = locales;

// Each language is named in itself, so a person who cannot read the current
// language can still find theirs. Never translated.
export const LOCALE_NAMES: Readonly<Record<Locale, string>> = {
	en: "English",
	id: "Bahasa Indonesia",
};

export type LocaleSource = "stored" | "browser" | "default";

export interface ResolvedLocale {
	readonly locale: Locale;
	readonly source: LocaleSource;
}

import { Effect, Option } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "#/paraglide/messages.js";

import { makeFakeLocaleHost } from "./fakes.ts";
import { changeLocale, matchLanguages, resolveLocale } from "./locale.ts";
import { currentLocale, resetLocale } from "./state.ts";

beforeEach(() => Effect.runSync(resetLocale));

const resolve = (opts: Parameters<typeof makeFakeLocaleHost>[0]) => {
	const host = makeFakeLocaleHost(opts);

	return {
		host,
		result: Effect.runPromise(resolveLocale.pipe(Effect.provide(host.layer))),
	};
};

describe("matchLanguages", () => {
	it("matches on the primary subtag", () => {
		expect(matchLanguages(["id-ID"])).toEqual(Option.some("id"));
		expect(matchLanguages(["en-GB"])).toEqual(Option.some("en"));
	});

	it("reads the legacy Android code for Indonesian", () => {
		expect(matchLanguages(["in"])).toEqual(Option.some("id"));
		expect(matchLanguages(["in-ID"])).toEqual(Option.some("id"));
	});

	it("takes the first language we ship, in the browser's order", () => {
		expect(matchLanguages(["fr-FR", "id", "en"])).toEqual(Option.some("id"));
		expect(matchLanguages(["en", "id"])).toEqual(Option.some("en"));
	});

	it("is None when no language matches", () => {
		expect(matchLanguages(["fr", "de"])).toEqual(Option.none());
		expect(matchLanguages([])).toEqual(Option.none());
		expect(matchLanguages([""])).toEqual(Option.none());
	});
});

describe("resolveLocale", () => {
	it("prefers a saved choice over the browser language", async () => {
		const { result, host } = resolve({ stored: "en", languages: ["id"] });

		expect(await result).toEqual({ locale: "en", source: "stored" });
		expect(currentLocale()).toBe("en");
		expect(host.state.documentLang).toBe("en");
	});

	it("falls back to the browser language when nothing is saved", async () => {
		const { result, host } = resolve({ languages: ["id-ID", "en"] });

		expect(await result).toEqual({ locale: "id", source: "browser" });
		expect(currentLocale()).toBe("id");
		expect(host.state.documentLang).toBe("id");
	});

	it("ignores a saved value that is not a language we ship", async () => {
		const { result } = resolve({ stored: "klingon", languages: ["id"] });

		expect(await result).toEqual({ locale: "id", source: "browser" });
	});

	it("reads a throwing storage as nothing saved", async () => {
		const { result } = resolve({ failRead: true, languages: ["id"] });

		expect(await result).toEqual({ locale: "id", source: "browser" });
	});

	it("defaults to English when no browser language matches", async () => {
		const { result } = resolve({ languages: ["fr"] });

		expect(await result).toEqual({ locale: "en", source: "default" });
	});

	it("defaults to English when the browser reports no languages", async () => {
		const { result } = resolve({});

		expect(await result).toEqual({ locale: "en", source: "default" });
	});
});

describe("changeLocale", () => {
	const change = (
		value: string,
		opts: Parameters<typeof makeFakeLocaleHost>[0] = {},
	) => {
		const host = makeFakeLocaleHost(opts);

		return Effect.runPromise(
			changeLocale(value).pipe(Effect.provide(host.layer)),
		).then(() => host);
	};

	it("switches the active locale, the document and the saved choice", async () => {
		const host = await change("id");

		expect(currentLocale()).toBe("id");
		expect(host.state.documentLang).toBe("id");
		expect(host.state.stored).toBe("id");
	});

	it("still switches for this visit when storage refuses the write", async () => {
		const host = await change("id", { failWrite: true });

		expect(currentLocale()).toBe("id");
		expect(host.state.documentLang).toBe("id");
		expect(host.state.writeAttempts).toBe(1);
		expect(host.state.stored).toBeUndefined();
	});

	it("ignores a value that is not one of our locales", async () => {
		const host = await change("klingon");

		expect(currentLocale()).toBe("en");
		expect(host.state.documentLang).toBeUndefined();
		expect(host.state.writeAttempts).toBe(0);
		expect(host.state.stored).toBeUndefined();
	});
});

describe("messages follow the active locale", () => {
	const change = (value: string) =>
		Effect.runPromise(
			changeLocale(value).pipe(Effect.provide(makeFakeLocaleHost().layer)),
		);

	it("reads the locale ref through overwriteGetLocale", async () => {
		expect(m.search_button_label()).toBe("Search tools");

		await change("id");

		expect(m.search_button_label()).toBe("Cari alat");
	});
});

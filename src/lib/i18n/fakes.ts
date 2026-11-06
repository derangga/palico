// Test double for LocaleHost. Not imported by app code.
import { Effect, Layer, Option } from "effect";

import { LocaleStorageError } from "./errors.ts";
import { LocaleHost } from "./hosts.ts";
import type { Locale } from "./shapes.ts";

interface FakeLocaleState {
	stored: string | undefined;
	documentLang: string | undefined;
	// How many times a write was attempted, whether or not it succeeded.
	writeAttempts: number;
}

export const makeFakeLocaleHost = (
	opts: {
		stored?: string;
		languages?: ReadonlyArray<string>;
		failRead?: boolean;
		failWrite?: boolean;
	} = {},
) => {
	const state: FakeLocaleState = {
		stored: opts.stored,
		documentLang: undefined,
		writeAttempts: 0,
	};

	const write = (locale: Locale) =>
		Effect.suspend(() => {
			state.writeAttempts++;

			if (opts.failWrite) {
				return Effect.fail(
					new LocaleStorageError({ operation: "write", message: "full" }),
				);
			}

			return Effect.sync(() => {
				state.stored = locale;
			});
		});

	const layer = Layer.succeed(LocaleHost, {
		readStored: opts.failRead
			? Effect.fail(
					new LocaleStorageError({ operation: "read", message: "blocked" }),
				)
			: Effect.sync(() => Option.fromUndefinedOr(state.stored)),
		write,
		languages: Effect.succeed(opts.languages ?? []),
		applyToDocument: (locale) =>
			Effect.sync(() => {
				state.documentLang = locale;
			}),
	});

	return { layer, state };
};

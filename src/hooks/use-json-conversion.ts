import { Effect, Fiber } from "effect";
import { useEffect, useMemo, useState } from "react";

import type { Locale } from "#/lib/i18n/shapes.ts";
import { type RunError, runConversion } from "#/lib/json-converter/client.ts";
import { messageTemplates } from "#/lib/json-converter/texts.ts";
import type { ConvertOptions } from "#/lib/json-converter/types.ts";

export type ConversionResult =
	| { readonly kind: "ok"; readonly output: string }
	| { readonly kind: "error"; readonly error: RunError };

// Text this long waits for a pause in typing, so a parse is not started per key.
const DEBOUNCE_CHARS = 20_000;
const DEBOUNCE_MS = 250;

/**
 * Converts `text` whenever it or an option changes. A run that is no longer
 * wanted is interrupted, which also ends its worker. `busy` is true from the
 * change until the new result lands, for text long enough to be debounced. Until
 * then the old result stays, dimmed, and cannot be copied or downloaded.
 */
export function useJsonConversion(
	text: string,
	options: Omit<ConvertOptions, "texts"> & { readonly locale: Locale },
) {
	const [result, setResult] = useState<ConversionResult | undefined>();
	const [busy, setBusy] = useState(false);

	const {
		source,
		target,
		indent,
		sortKeys,
		guessTypes,
		inputDelimiter,
		outputDelimiter,
		locale,
	} = options;

	const texts = useMemo(() => messageTemplates(locale), [locale]);

	useEffect(() => {
		if (text.trim() === "") {
			// oxlint-disable-next-line react/set-state-in-effect -- an empty input has no result to show.
			setResult(undefined);
			setBusy(false);

			return;
		}

		const debounced = text.length >= DEBOUNCE_CHARS;
		let fiber: Fiber.Fiber<void> | undefined;

		// The old result is stale from now until the new one lands.
		setBusy(debounced);

		const start = () => {
			fiber = Effect.runFork(
				runConversion(text, {
					source,
					target,
					indent,
					sortKeys,
					guessTypes,
					inputDelimiter,
					outputDelimiter,
					texts,
				}).pipe(
					Effect.match({
						onSuccess: (output): ConversionResult => ({ kind: "ok", output }),
						onFailure: (error): ConversionResult => ({ kind: "error", error }),
					}),
					Effect.map((next) => {
						setResult(next);
						setBusy(false);
					}),
				),
			);
		};

		const timer = debounced ? window.setTimeout(start, DEBOUNCE_MS) : undefined;

		if (timer === undefined) start();

		return () => {
			window.clearTimeout(timer);

			if (fiber) Effect.runFork(Fiber.interrupt(fiber));
		};
	}, [
		text,
		source,
		target,
		indent,
		sortKeys,
		guessTypes,
		inputDelimiter,
		outputDelimiter,
		texts,
	]);

	return { result, busy };
}

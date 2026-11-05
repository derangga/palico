// The browser's EyeDropper reads any pixel on the screen, even outside the page.
// Chromium only, and TypeScript has no types for it, so it is declared here.

import { Effect, Option } from "effect";

import { ScreenPickError } from "./errors.ts";
import type { Rgb } from "./oklab.ts";
import { parseColor } from "./parse.ts";

interface EyeDropperLike {
	open(options?: { readonly signal?: AbortSignal }): Promise<{
		readonly sRGBHex: string;
	}>;
}

interface EyeDropperConstructor {
	new (): EyeDropperLike;
}

function constructorOf(): EyeDropperConstructor | undefined {
	// SAFETY: TypeScript's DOM types do not know EyeDropper. The property is
	// either the browser's constructor or absent, which is what this type says.
	return (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
}

/** Browser only. The page must not call this while rendering on the server. */
export const eyeDropperSupported = (): boolean => "EyeDropper" in window;

/**
 * Lets the person click any pixel on screen. None means they cancelled with Esc,
 * which is not an error.
 */
export const pickFromScreen = (
	signal: AbortSignal,
): Effect.Effect<Option.Option<Rgb>, ScreenPickError> =>
	Effect.tryPromise({
		try: async () => {
			const Dropper = constructorOf();

			if (!Dropper) throw new Error("EyeDropper is not available.");

			try {
				const { sRGBHex } = await new Dropper().open({ signal });
				const rgb = parseColor(sRGBHex);

				if (!rgb) throw new Error(`Unreadable color: ${sRGBHex}`);

				return Option.some(rgb);
			} catch (cause) {
				if (cause instanceof DOMException && cause.name === "AbortError") {
					return Option.none();
				}

				throw cause;
			}
		},
		catch: (cause) => {
			console.error(cause);

			return new ScreenPickError({
				message: "Couldn't read a color from the screen.",
			});
		},
	});

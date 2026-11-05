import { Effect } from "effect";

import { ClipboardWriteError } from "#/lib/markdown/errors.ts";

/** Puts text on the clipboard. Fails with a message that says what to do next. */
export const copyText = (
	text: string,
): Effect.Effect<void, ClipboardWriteError> =>
	Effect.tryPromise({
		try: () => navigator.clipboard.writeText(text),
		catch: () =>
			new ClipboardWriteError({
				message: "Couldn't copy the text. Select it and copy it by hand.",
			}),
	});

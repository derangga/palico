import { Effect, Option } from "effect";

import { MarkdownStorageError } from "./errors.ts";

const STORAGE_KEY = "palico:markdown-preview";

// Read the persisted document. `Option.none()` means "no key yet" (a genuine
// first visit) as opposed to a stored-but-empty document — the caller uses that
// distinction to decide whether to seed the sample. Both the missing-key case
// and any thrown DOMException are kept off the happy path.
export const loadMarkdown: Effect.Effect<
	Option.Option<string>,
	MarkdownStorageError
> = Effect.try({
	try: () => Option.fromNullishOr(localStorage.getItem(STORAGE_KEY)),
	catch: (cause) =>
		new MarkdownStorageError({
			operation: "load",
			message:
				cause instanceof Error
					? cause.message
					: "Couldn't read your saved Markdown.",
		}),
});

// Persist the current document. Best-effort: a full-quota or private-mode
// failure surfaces on the error channel for the caller to ignore or report.
export const saveMarkdown = (
	content: string,
): Effect.Effect<void, MarkdownStorageError> =>
	Effect.try({
		try: () => localStorage.setItem(STORAGE_KEY, content),
		catch: (cause) =>
			new MarkdownStorageError({
				operation: "save",
				message:
					cause instanceof Error
						? cause.message
						: "Couldn't save your Markdown.",
			}),
	});

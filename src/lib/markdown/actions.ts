import { Effect } from "effect";

import { ClipboardWriteError, FileDownloadError } from "./errors.ts";

// Copy the raw Markdown source to the clipboard. Kept on the error channel so
// the caller can surface a failure toast (permission denied, insecure context).
export const copyMarkdown = (
	source: string,
): Effect.Effect<void, ClipboardWriteError> =>
	Effect.tryPromise({
		try: () => navigator.clipboard.writeText(source),
		catch: (cause) =>
			new ClipboardWriteError({
				message:
					cause instanceof Error
						? cause.message
						: "Couldn't copy to the clipboard.",
			}),
	});

// Save the raw Markdown source as a .md file via a transient object URL. The
// URL is always revoked, even if the anchor click throws, so we don't leak it.
export const downloadMarkdown = (
	source: string,
	fileName: string,
): Effect.Effect<void, FileDownloadError> =>
	Effect.try({
		try: () => {
			const url = URL.createObjectURL(
				new Blob([source], { type: "text/markdown" }),
			);

			try {
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = fileName;
				anchor.click();
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		catch: (cause) =>
			new FileDownloadError({
				message:
					cause instanceof Error
						? cause.message
						: "Couldn't download the file.",
			}),
	});

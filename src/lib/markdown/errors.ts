import { Schema } from "effect";

// localStorage can throw for reasons outside our control — disabled in private
// mode, quota exceeded on save, or unavailable during SSR. Surface it on the
// error channel so the UI can decide to fall back to the sample rather than
// swallowing it.
export class MarkdownStorageError extends Schema.TaggedError<MarkdownStorageError>()(
	"MarkdownStorageError",
	{
		operation: Schema.Literal("load", "save"),
		message: Schema.String,
	},
) {}

// The mermaid bundle is loaded on demand; a network/chunk failure is a distinct
// failure from a diagram that simply doesn't parse, so the two are kept apart.
export class MermaidLoadError extends Schema.TaggedError<MermaidLoadError>()(
	"MermaidLoadError",
	{
		message: Schema.String,
	},
) {}

// Raised when mermaid can't parse/render the diagram source — the common case
// while a diagram is half-typed. The message is mermaid's own parser output so
// the inline error box can point at what's wrong.
export class MermaidRenderError extends Schema.TaggedError<MermaidRenderError>()(
	"MermaidRenderError",
	{
		message: Schema.String,
	},
) {}

// The Clipboard API can reject (permission denied, insecure context, or simply
// unavailable) — surface it so the toolbar can show a failure toast.
export class ClipboardWriteError extends Schema.TaggedError<ClipboardWriteError>()(
	"ClipboardWriteError",
	{
		message: Schema.String,
	},
) {}

// Raised if constructing the blob / triggering the download anchor throws.
export class FileDownloadError extends Schema.TaggedError<FileDownloadError>()(
	"FileDownloadError",
	{
		message: Schema.String,
	},
) {}

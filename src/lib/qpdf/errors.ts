import { Schema } from "effect";

// Failures of the qpdf engine itself, shared by every tool that runs qpdf. A tool's
// own failures (a wrong password, say) live with the tool.

// The wasm could not be downloaded, stored or started. Offline with the engine
// missing from the cache lands here too. The stage says where it stopped.
export class PdfEngineLoadError extends Schema.TaggedError<PdfEngineLoadError>()(
	"PdfEngineLoadError",
	{
		stage: Schema.Literals(["downloading", "caching", "starting"]),
		message: Schema.String,
	},
) {}

// The job worker crashed or answered with something we cannot read. Not the PDF's
// fault, so the message does not blame the file.
export class QpdfWorkerError extends Schema.TaggedError<QpdfWorkerError>()(
	"QpdfWorkerError",
	{
		message: Schema.String,
	},
) {}

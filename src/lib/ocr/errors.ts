import { Schema } from "effect";

// Distinct failure reasons for the OCR pipeline, each with a user-facing message.

export class OcrLoadError extends Schema.TaggedError<OcrLoadError>()(
	"OcrLoadError",
	{
		message: Schema.String,
	},
) {}

export class OcrRecognitionError extends Schema.TaggedError<OcrRecognitionError>()(
	"OcrRecognitionError",
	{
		message: Schema.String,
	},
) {}

export class OcrPreprocessError extends Schema.TaggedError<OcrPreprocessError>()(
	"OcrPreprocessError",
	{
		message: Schema.String,
	},
) {}

export type OcrError = OcrLoadError | OcrRecognitionError;

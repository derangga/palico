import { Schema } from "effect";

// The text is longer than the largest QR code can hold at the chosen level.
export class QrCapacityError extends Schema.TaggedError<QrCapacityError>()(
	"QrCapacityError",
	{
		length: Schema.Number,
		limit: Schema.Number,
		message: Schema.String,
	},
) {}

// The image loaded but holds no readable QR code. The common case, so the
// message says what to try.
export class QrNotFoundError extends Schema.TaggedError<QrNotFoundError>()(
	"QrNotFoundError",
	{
		message: Schema.String,
	},
) {}

// The browser could not turn the file into pixels (not an image, corrupt, or
// a format it cannot decode).
export class QrImageError extends Schema.TaggedError<QrImageError>()(
	"QrImageError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// The decode worker crashed or never started.
export class QrWorkerError extends Schema.TaggedError<QrWorkerError>()(
	"QrWorkerError",
	{
		message: Schema.String,
	},
) {}

// Drawing the symbol to a canvas or encoding the PNG failed.
export class QrRenderError extends Schema.TaggedError<QrRenderError>()(
	"QrRenderError",
	{
		message: Schema.String,
	},
) {}

export class CameraError extends Schema.TaggedError<CameraError>()(
	"CameraError",
	{
		reason: Schema.Literals(["denied", "no-camera", "in-use", "unsupported"]),
		message: Schema.String,
	},
) {}

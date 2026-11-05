import { Schema } from "effect";

// The browser could not turn the file into pixels (not an image, corrupt, or
// a format it cannot decode).
export class PaletteImageError extends Schema.TaggedError<PaletteImageError>()(
	"PaletteImageError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// The image decoded but has no visible pixels, so there is nothing to sample.
export class PaletteEmptyError extends Schema.TaggedError<PaletteEmptyError>()(
	"PaletteEmptyError",
	{
		message: Schema.String,
	},
) {}

// The palette worker crashed or never started.
export class PaletteWorkerError extends Schema.TaggedError<PaletteWorkerError>()(
	"PaletteWorkerError",
	{
		message: Schema.String,
	},
) {}

// The picker could not turn the file into pixels on its canvas (not an image,
// corrupt, or a format the browser cannot decode).
export class ColorImageError extends Schema.TaggedError<ColorImageError>()(
	"ColorImageError",
	{
		fileName: Schema.String,
		message: Schema.String,
	},
) {}

// The browser's EyeDropper failed for a reason other than the person pressing Esc.
export class ScreenPickError extends Schema.TaggedError<ScreenPickError>()(
	"ScreenPickError",
	{
		message: Schema.String,
	},
) {}

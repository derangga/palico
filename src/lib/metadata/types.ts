import { Schema } from "effect";

// Shared shapes for the Remove Metadata tool. Images are read on the main
// thread (src/lib/metadata/image-read.ts); PDFs in the PDF worker
// (src/lib/file/pdf-metadata.ts). Both produce a MetadataReport.

export const MetadataGroup = Schema.Literals([
	"Location",
	"Device",
	"Dates",
	"People",
	"Software",
	"Other",
]);
export type MetadataGroup = Schema.Schema.Type<typeof MetadataGroup>;

// One removable piece of hidden data, e.g. { Device, "Camera", "Apple iPhone 15" }.
export const MetadataField = Schema.Struct({
	group: MetadataGroup,
	label: Schema.String,
	value: Schema.String,
});
export type MetadataField = Schema.Schema.Type<typeof MetadataField>;

export const MetadataReport = Schema.Struct({
	// Everything the stripper removes. Empty means the file is clean.
	fields: Schema.Array(MetadataField),
	// What stays on purpose and is not identifying ("colour profile", "orientation").
	kept: Schema.Array(Schema.String),
	gps: Schema.optional(
		Schema.Struct({ lat: Schema.Number, lon: Schema.Number }),
	),
});
export type MetadataReport = Schema.Schema.Type<typeof MetadataReport>;

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];

// Long values (descriptions, XMP keywords) are capped in the report so a
// hostile file cannot flood the UI.
export const MAX_VALUE_LENGTH = 500;

export const clip = (value: string) =>
	value.length > MAX_VALUE_LENGTH
		? `${value.slice(0, MAX_VALUE_LENGTH)}…`
		: value;

export const formatSize = (bytes: number) =>
	bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;

import { m } from "#/paraglide/messages.js";

import type { MetadataGroup } from "./types.ts";

// The reader (src/lib/metadata and the PDF worker) produces stable English keys:
// group names, field labels and a few fixed values. The page words them here, on
// the main thread, in the active language. A label the table does not know (a PNG
// text keyword, for instance) is the file's own text and shows as it is.

const GROUPS: Readonly<Record<MetadataGroup, () => string>> = {
	Location: () => m.metadata_group_location(),
	Device: () => m.metadata_group_device(),
	Dates: () => m.metadata_group_dates(),
	People: () => m.metadata_group_people(),
	Software: () => m.metadata_group_software(),
	Other: () => m.metadata_group_other(),
};

export const groupLabel = (group: MetadataGroup): string => GROUPS[group]();

const LABELS: ReadonlyMap<string, () => string> = new Map([
	["Camera maker", () => m.metadata_label_camera_maker()],
	["Camera model", () => m.metadata_label_camera_model()],
	["Software", () => m.metadata_label_software()],
	["Modified", () => m.metadata_label_modified()],
	["Artist", () => m.metadata_label_artist()],
	["Copyright", () => m.metadata_label_copyright()],
	["Description", () => m.metadata_label_description()],
	["Taken", () => m.metadata_label_taken()],
	["Digitized", () => m.metadata_label_digitized()],
	["Camera owner", () => m.metadata_label_camera_owner()],
	["Serial number", () => m.metadata_label_serial()],
	["Lens", () => m.metadata_label_lens()],
	["Coordinates", () => m.metadata_label_coordinates()],
	["Altitude", () => m.metadata_label_altitude()],
	["GPS details", () => m.metadata_label_gps_details()],
	["Camera settings", () => m.metadata_label_camera_settings()],
	["Thumbnail", () => m.metadata_label_thumbnail()],
	["EXIF data", () => m.metadata_label_exif()],
	["Author", () => m.metadata_label_author()],
	["Created", () => m.metadata_label_created()],
	["Source", () => m.metadata_label_source()],
	["Title", () => m.metadata_label_title()],
	["Subject", () => m.metadata_label_subject()],
	["Keywords", () => m.metadata_label_keywords()],
	["Created with", () => m.metadata_label_created_with()],
	["Producer", () => m.metadata_label_producer()],
	["Orientation", () => m.metadata_label_orientation()],
	["XMP data", () => m.metadata_label_xmp()],
	["IPTC data", () => m.metadata_label_iptc()],
	["Comment", () => m.metadata_label_comment()],
	["Extra embedded data", () => m.metadata_label_extra()],
	["Old document info", () => m.metadata_label_old_info()],
	["Text", () => m.metadata_label_text()],
]);

/** Every label the reader can produce that the page words. The test checks the readers against it. */
export const KNOWN_LABELS: ReadonlyArray<string> = [...LABELS.keys()];

export const fieldLabel = (label: string): string =>
	LABELS.get(label)?.() ?? label;

const VALUES: ReadonlyMap<string, () => string> = new Map([
	["Embedded preview image", () => m.metadata_value_preview()],
	["Mirrored", () => m.metadata_value_mirrored()],
	["Upside down", () => m.metadata_value_upside_down()],
	["Upside down, mirrored", () => m.metadata_value_upside_down_mirrored()],
	["Rotated, mirrored", () => m.metadata_value_rotated_mirrored()],
	["Rotated 90° clockwise", () => m.metadata_value_rotated_cw()],
	["Rotated 90° anticlockwise", () => m.metadata_value_rotated_ccw()],
	["Rotated", () => m.metadata_value_rotated()],
	["present", () => m.metadata_value_present()],
	["(empty)", () => m.metadata_value_empty()],
]);

// Values the reader builds around a number or a size: "3 more tags", "12 KB
// (unreadable)". Each pattern rewords the part around the number.
const PATTERNS: ReadonlyArray<
	readonly [RegExp, (match: RegExpMatchArray) => string]
> = [
	[
		/^(\d+) more tags?$/,
		(match) =>
			match[1] === "1"
				? m.metadata_value_more_tags_one({ count: 1 })
				: m.metadata_value_more_tags_other({ count: Number(match[1]) }),
	],
	[
		/^(\d+) earlier versions?$/,
		(match) =>
			match[1] === "1"
				? m.metadata_value_earlier_one({ count: 1 })
				: m.metadata_value_earlier_other({ count: Number(match[1]) }),
	],
	[
		/^(\d+) blocks, (.+)$/,
		(match) =>
			m.metadata_value_blocks({ count: Number(match[1]), size: match[2] }),
	],
	[
		/^(.+) \(unreadable\)$/,
		(match) => m.metadata_value_unreadable({ size: match[1] }),
	],
	[
		/^compressed text, (.+)$/,
		(match) => m.metadata_value_compressed({ size: match[1] }),
	],
];

export const fieldValue = (value: string): string => {
	const fixed = VALUES.get(value);

	if (fixed) return fixed();

	for (const [pattern, word] of PATTERNS) {
		const match = value.match(pattern);

		if (match) return word(match);
	}

	return value;
};

const KEPT: ReadonlyMap<string, () => string> = new Map([
	["orientation", () => m.metadata_kept_orientation()],
	["colour profile", () => m.metadata_kept_profile()],
]);

export const keptLabel = (kept: string): string => KEPT.get(kept)?.() ?? kept;

export const itemCount = (count: number): string =>
	count === 1
		? m.metadata_item_count_one({ count })
		: m.metadata_item_count_other({ count });

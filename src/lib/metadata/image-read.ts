import { Effect } from "effect";

import { MetadataParseError, UnsupportedFormatError } from "./errors.ts";
import {
	clip,
	formatSize,
	type MetadataField,
	type MetadataGroup,
	type MetadataReport,
} from "./types.ts";

// Reads hidden metadata from JPEG, PNG and WebP by walking the container
// structure only. Pixels are never decoded. The walkers are shared with the
// stripper (image-strip.ts), which drops the same segments this file reports.

export type ImageFormat = "jpeg" | "png" | "webp";

// What a segment (JPEG marker segment, PNG chunk, WebP RIFF chunk) holds.
// Everything except "icc" and "keep" is removed by the stripper.
export type SegmentKind =
	| "exif"
	| "xmp"
	| "iptc"
	| "comment"
	| "text"
	| "time"
	| "extra"
	| "icc"
	| "keep";

export interface Segment {
	readonly kind: SegmentKind;
	readonly name: string;
	/** First byte of the segment header. */
	readonly start: number;
	/** One past the last byte, including CRC or padding. */
	readonly end: number;
	readonly dataStart: number;
	readonly dataEnd: number;
}

export interface Layout {
	readonly format: ImageFormat;
	readonly segments: ReadonlyArray<Segment>;
	/** Bytes from here to the end are image data, kept verbatim (JPEG: from SOS). */
	readonly tailStart: number;
}

export const REMOVABLE: ReadonlySet<SegmentKind> = new Set([
	"exif",
	"xmp",
	"iptc",
	"comment",
	"text",
	"time",
	"extra",
]);

class ParseFailure extends Error {}
const fail = (message: string): never => {
	throw new ParseFailure(message);
};

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

const startsWith = (b: Uint8Array, at: number, text: string) => {
	if (at + text.length > b.length) return false;
	for (let i = 0; i < text.length; i++) {
		if (b[at + i] !== text.charCodeAt(i)) return false;
	}
	return true;
};

const ascii = (b: Uint8Array, at: number, length: number) =>
	latin1.decode(b.subarray(at, at + length));

const view = (b: Uint8Array) =>
	new DataView(b.buffer, b.byteOffset, b.byteLength);

const PNG_SIGNATURE = "\x89PNG\r\n\x1a\n";

export const detectImageFormat = (b: Uint8Array): ImageFormat | undefined => {
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
	if (startsWith(b, 0, PNG_SIGNATURE)) return "png";
	if (startsWith(b, 0, "RIFF") && startsWith(b, 8, "WEBP")) return "webp";
	return undefined;
};

// --- Walkers ----------------------------------------------------------------

const jpegKind = (b: Uint8Array, marker: number, data: number): SegmentKind => {
	if (marker === 0xe1) {
		if (startsWith(b, data, "Exif\0\0")) return "exif";
		if (startsWith(b, data, "http://ns.adobe.com/")) return "xmp";
		return "extra";
	}
	if (marker === 0xe2) {
		return startsWith(b, data, "ICC_PROFILE\0") ? "icc" : "extra";
	}
	if (marker === 0xed) return "iptc";
	if (marker === 0xfe) return "comment";
	// APP0 (JFIF) and APP14 (Adobe colour transform) are needed to decode.
	if (marker === 0xe0 || marker === 0xee) return "keep";
	if (marker >= 0xe3 && marker <= 0xef) return "extra";
	return "keep";
};

const walkJpeg = (b: Uint8Array): Layout => {
	const segments: Segment[] = [];
	let pos = 2;
	for (;;) {
		// Skip optional 0xFF fill bytes before a marker.
		while (pos + 1 < b.length && b[pos] === 0xff && b[pos + 1] === 0xff) pos++;
		if (pos + 2 > b.length) fail("This JPEG ends before its image data.");
		if (b[pos] !== 0xff) fail(`Expected a JPEG marker at byte ${pos}.`);
		const marker = b[pos + 1];
		// Start of scan or end of image: the rest is compressed image data.
		if (marker === 0xda || marker === 0xd9) {
			return { format: "jpeg", segments, tailStart: pos };
		}
		if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
			segments.push({
				kind: "keep",
				name: "RST",
				start: pos,
				end: pos + 2,
				dataStart: pos + 2,
				dataEnd: pos + 2,
			});
			pos += 2;
			continue;
		}
		if (pos + 4 > b.length) fail("This JPEG ends inside a segment header.");
		const length = (b[pos + 2] << 8) | b[pos + 3];
		const end = pos + 2 + length;
		if (length < 2 || end > b.length) {
			fail("A JPEG segment runs past the end of the file.");
		}
		const dataStart = pos + 4;
		segments.push({
			kind: jpegKind(b, marker, dataStart),
			name:
				marker >= 0xe0 && marker <= 0xef
					? `APP${marker - 0xe0}`
					: `0x${marker.toString(16).toUpperCase()}`,
			start: pos,
			end,
			dataStart,
			dataEnd: end,
		});
		pos = end;
	}
};

const pngKind = (b: Uint8Array, type: string, data: number): SegmentKind => {
	switch (type) {
		case "eXIf":
			return "exif";
		case "iTXt":
			return startsWith(b, data, "XML:com.adobe.xmp\0") ? "xmp" : "text";
		case "tEXt":
		case "zTXt":
			return "text";
		case "tIME":
			return "time";
		case "iCCP":
			return "icc";
		default:
			return "keep";
	}
};

const walkPng = (b: Uint8Array): Layout => {
	const dv = view(b);
	const segments: Segment[] = [];
	let pos = 8;
	while (pos < b.length) {
		if (pos + 12 > b.length) fail("A PNG chunk runs past the end of the file.");
		const length = dv.getUint32(pos);
		const type = ascii(b, pos + 4, 4);
		const dataStart = pos + 8;
		const dataEnd = dataStart + length;
		const end = dataEnd + 4;
		if (end > b.length) fail("A PNG chunk runs past the end of the file.");
		segments.push({
			kind: pngKind(b, type, dataStart),
			name: type,
			start: pos,
			end,
			dataStart,
			dataEnd,
		});
		pos = end;
		if (type === "IEND") break;
	}
	// Bytes after IEND are not part of the image and are dropped.
	return { format: "png", segments, tailStart: b.length };
};

const walkWebp = (b: Uint8Array): Layout => {
	if (b.length < 12) fail("This WebP file is too short.");
	const dv = view(b);
	const riffEnd = Math.min(b.length, 8 + dv.getUint32(4, true));
	const segments: Segment[] = [];
	let pos = 12;
	while (pos + 8 <= riffEnd) {
		const type = ascii(b, pos, 4);
		const length = dv.getUint32(pos + 4, true);
		const dataStart = pos + 8;
		const dataEnd = dataStart + length;
		if (dataEnd > b.length) fail("A WebP chunk runs past the end of the file.");
		const end = Math.min(dataEnd + (length & 1), b.length);
		segments.push({
			kind:
				type === "EXIF"
					? "exif"
					: type === "XMP "
						? "xmp"
						: type === "ICCP"
							? "icc"
							: "keep",
			name: type,
			start: pos,
			end,
			dataStart,
			dataEnd,
		});
		pos = end;
	}
	return { format: "webp", segments, tailStart: b.length };
};

export const walkImage = (format: ImageFormat, b: Uint8Array): Layout =>
	format === "jpeg" ? walkJpeg(b) : format === "png" ? walkPng(b) : walkWebp(b);

// --- EXIF (TIFF) ------------------------------------------------------------

const TYPE_SIZE: Record<number, number> = {
	1: 1,
	2: 1,
	3: 2,
	4: 4,
	5: 8,
	6: 1,
	7: 1,
	8: 2,
	9: 4,
	10: 8,
	11: 4,
	12: 8,
};

type Known = Record<number, readonly [MetadataGroup, string]>;

const IFD0_TAGS: Known = {
	271: ["Device", "Camera maker"],
	272: ["Device", "Camera model"],
	305: ["Software", "Software"],
	306: ["Dates", "Modified"],
	315: ["People", "Artist"],
	33432: ["People", "Copyright"],
	270: ["Other", "Description"],
};

const EXIF_TAGS: Known = {
	36867: ["Dates", "Taken"],
	36868: ["Dates", "Digitized"],
	42032: ["People", "Camera owner"],
	42033: ["Device", "Serial number"],
	42036: ["Device", "Lens"],
};

const ORIENTATION = 0x0112;
const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;
const INTEROP_IFD = 0xa005;

export interface ExifSummary {
	readonly fields: ReadonlyArray<MetadataField>;
	readonly orientation: number;
	readonly gps?: { readonly lat: number; readonly lon: number };
}

interface Entry {
	readonly type: number;
	readonly count: number;
	readonly at: number;
}

const prettyDate = (value: string) =>
	value.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");

// Parse a TIFF block (the body of an EXIF segment). Throws on broken offsets;
// readExif turns that into a single "unreadable" field.
const parseTiff = (b: Uint8Array, start: number, end: number): ExifSummary => {
	const dv = new DataView(b.buffer, b.byteOffset + start, end - start);
	const order = dv.getUint16(0);
	if (order !== 0x4949 && order !== 0x4d4d) throw new Error("bad byte order");
	const le = order === 0x4949;
	const u16 = (o: number) => dv.getUint16(o, le);
	const u32 = (o: number) => dv.getUint32(o, le);

	const readIfd = (offset: number) => {
		const entries = new Map<number, Entry>();
		const n = Math.min(u16(offset), 1000);
		for (let i = 0; i < n; i++) {
			const e = offset + 2 + i * 12;
			const type = u16(e + 2);
			const count = u32(e + 4);
			const size = (TYPE_SIZE[type] ?? 1) * count;
			const at = size <= 4 ? e + 8 : u32(e + 8);
			if (at + size <= dv.byteLength) {
				entries.set(u16(e), { type, count, at });
			}
		}
		return { entries, next: u32(offset + 2 + n * 12) };
	};

	const text = (e: Entry) =>
		clip(
			utf8
				.decode(new Uint8Array(dv.buffer, dv.byteOffset + e.at, e.count))
				.replace(/\0+$/, "")
				.trim(),
		);
	const rational = (e: Entry, i: number) => {
		const den = u32(e.at + i * 8 + 4);
		return den === 0 ? 0 : u32(e.at + i * 8) / den;
	};
	const value = (e: Entry) =>
		e.type === 2
			? text(e)
			: e.type === 3
				? String(u16(e.at))
				: e.type === 4
					? String(u32(e.at))
					: `${e.count} bytes`;

	const fields: MetadataField[] = [];
	let others = 0;
	const collect = (
		entries: Map<number, Entry>,
		known: Known,
		skip: number[],
	) => {
		for (const [tag, entry] of entries) {
			const meta = known[tag];
			if (meta) {
				const v = value(entry);
				if (v) {
					fields.push({
						group: meta[0],
						label: meta[1],
						value: meta[0] === "Dates" ? prettyDate(v) : v,
					});
				}
			} else if (!skip.includes(tag)) {
				others++;
			}
		}
	};

	const ifd0 = readIfd(u32(4));
	collect(ifd0.entries, IFD0_TAGS, [ORIENTATION, EXIF_IFD, GPS_IFD]);
	const orientationEntry = ifd0.entries.get(ORIENTATION);
	const orientation = orientationEntry ? u16(orientationEntry.at) : 1;

	const exifPtr = ifd0.entries.get(EXIF_IFD);
	if (exifPtr) {
		collect(readIfd(u32(exifPtr.at)).entries, EXIF_TAGS, [INTEROP_IFD]);
	}

	let gps: ExifSummary["gps"];
	const gpsPtr = ifd0.entries.get(GPS_IFD);
	if (gpsPtr) {
		const g = readIfd(u32(gpsPtr.at)).entries;
		const latRef = g.get(1);
		const lat = g.get(2);
		const lonRef = g.get(3);
		const lon = g.get(4);
		const used = new Set<number>();
		if (lat && lon && lat.count >= 3 && lon.count >= 3) {
			const deg = (e: Entry) =>
				rational(e, 0) + rational(e, 1) / 60 + rational(e, 2) / 3600;
			const sign = (e: Entry | undefined, negative: string) =>
				e && String.fromCharCode(dv.getUint8(e.at)) === negative ? -1 : 1;
			gps = {
				lat: deg(lat) * sign(latRef, "S"),
				lon: deg(lon) * sign(lonRef, "W"),
			};
			fields.push({
				group: "Location",
				label: "Coordinates",
				value: `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`,
			});
			for (const t of [1, 2, 3, 4]) used.add(t);
		}
		const alt = g.get(6);
		if (alt?.type === 5) {
			const below = g.get(5) && dv.getUint8((g.get(5) as Entry).at) === 1;
			fields.push({
				group: "Location",
				label: "Altitude",
				value: `${(below ? -1 : 1) * Math.round(rational(alt, 0))} m`,
			});
			used.add(5);
			used.add(6);
		}
		const rest = [...g.keys()].filter((t) => !used.has(t)).length;
		if (rest > 0) {
			fields.push({
				group: "Location",
				label: "GPS details",
				value: `${rest} more tag${rest === 1 ? "" : "s"}`,
			});
		}
	}

	if (others > 0) {
		fields.push({
			group: "Other",
			label: "Camera settings",
			value: `${others} more tag${others === 1 ? "" : "s"}`,
		});
	}
	if (ifd0.next !== 0) {
		fields.push({
			group: "Other",
			label: "Thumbnail",
			value: "Embedded preview image",
		});
	}

	return { fields, orientation, gps };
};

export const readExif = (
	b: Uint8Array,
	start: number,
	end: number,
): ExifSummary => {
	// JPEG APP1 always starts with "Exif\0\0"; some PNG/WebP writers add it too.
	const body = startsWith(b, start, "Exif\0\0") ? start + 6 : start;
	try {
		return parseTiff(b, body, end);
	} catch {
		return {
			fields: [
				{
					group: "Other",
					label: "EXIF data",
					value: `${formatSize(end - start)} (unreadable)`,
				},
			],
			orientation: 1,
		};
	}
};

// --- PNG text chunks --------------------------------------------------------

const PNG_TEXT_KEYS: Record<string, readonly [MetadataGroup, string]> = {
	Author: ["People", "Author"],
	Copyright: ["People", "Copyright"],
	"Creation Time": ["Dates", "Created"],
	Software: ["Software", "Software"],
	Source: ["Device", "Source"],
};

const pngText = (b: Uint8Array, s: Segment): MetadataField => {
	const data = b.subarray(s.dataStart, s.dataEnd);
	const nul = data.indexOf(0);
	const keyword = latin1.decode(
		data.subarray(0, nul === -1 ? data.length : nul),
	);
	let value: string;
	if (nul === -1) {
		value = "";
	} else if (s.name === "tEXt") {
		value = latin1.decode(data.subarray(nul + 1));
	} else if (s.name === "zTXt" || data[nul + 1] === 1) {
		value = `compressed text, ${formatSize(data.length)}`;
	} else {
		// iTXt: keyword\0 flag method language\0 translated-keyword\0 text
		let at = nul + 3;
		for (let skip = 0; skip < 2 && at <= data.length; skip++) {
			const next = data.indexOf(0, at);
			at = next === -1 ? data.length : next + 1;
		}
		value = utf8.decode(data.subarray(at));
	}
	const [group, label] = PNG_TEXT_KEYS[keyword] ?? ["Other", keyword || "Text"];
	return { group, label, value: clip(value.trim()) || "(empty)" };
};

const pngTime = (b: Uint8Array, s: Segment): MetadataField => {
	const dv = view(b);
	const p2 = (n: number) => String(n).padStart(2, "0");
	const value =
		s.dataEnd - s.dataStart >= 7
			? `${dv.getUint16(s.dataStart)}-${p2(b[s.dataStart + 2])}-${p2(b[s.dataStart + 3])} ${p2(b[s.dataStart + 4])}:${p2(b[s.dataStart + 5])}:${p2(b[s.dataStart + 6])}`
			: "present";
	return { group: "Dates", label: "Modified", value };
};

// --- Report -----------------------------------------------------------------

const ORIENTATION_LABELS: Record<number, string> = {
	2: "Mirrored",
	3: "Upside down",
	4: "Upside down, mirrored",
	5: "Rotated, mirrored",
	6: "Rotated 90° clockwise",
	7: "Rotated, mirrored",
	8: "Rotated 90° anticlockwise",
};

export const buildReport = (b: Uint8Array, layout: Layout): MetadataReport => {
	const fields: MetadataField[] = [];
	const kept = new Set<string>();
	let gps: MetadataReport["gps"];
	for (const s of layout.segments) {
		const size = formatSize(s.end - s.start);
		switch (s.kind) {
			case "exif": {
				const exif = readExif(b, s.dataStart, s.dataEnd);
				fields.push(...exif.fields);
				gps ??= exif.gps;
				if (exif.orientation !== 1) {
					// JPEG keeps orientation in a minimal EXIF block; PNG/WebP lose it.
					if (layout.format === "jpeg") kept.add("orientation");
					else
						fields.push({
							group: "Other",
							label: "Orientation",
							value: ORIENTATION_LABELS[exif.orientation] ?? "Rotated",
						});
				}
				break;
			}
			case "xmp":
				fields.push({ group: "Other", label: "XMP data", value: size });
				break;
			case "iptc":
				fields.push({ group: "Other", label: "IPTC data", value: size });
				break;
			case "comment":
				fields.push({
					group: "Other",
					label: "Comment",
					value:
						clip(latin1.decode(b.subarray(s.dataStart, s.dataEnd)).trim()) ||
						"(empty)",
				});
				break;
			case "text":
				fields.push(pngText(b, s));
				break;
			case "time":
				fields.push(pngTime(b, s));
				break;
			case "extra":
				fields.push({
					group: "Other",
					label: "Extra embedded data",
					value: `${s.name}, ${size}`,
				});
				break;
			case "icc":
				kept.add("colour profile");
				break;
			case "keep":
				break;
		}
	}
	return { fields, kept: [...kept], gps };
};

// --- Effect entry points ----------------------------------------------------

export const parseImage = (
	fileName: string,
	bytes: Uint8Array,
): Effect.Effect<Layout, MetadataParseError | UnsupportedFormatError> => {
	const format = detectImageFormat(bytes);
	if (!format) {
		return Effect.fail(
			new UnsupportedFormatError({
				fileName,
				mime: "unknown",
				message: `"${fileName}" is not a JPEG, PNG or WebP image.`,
			}),
		);
	}
	return Effect.try({
		try: () => walkImage(format, bytes),
		catch: (err) =>
			new MetadataParseError({
				fileName,
				message:
					err instanceof ParseFailure || err instanceof RangeError
						? err.message
						: `Could not read "${fileName}".`,
			}),
	});
};

export const readImageMetadata = (
	fileName: string,
	bytes: Uint8Array,
): Effect.Effect<MetadataReport, MetadataParseError | UnsupportedFormatError> =>
	parseImage(fileName, bytes).pipe(
		Effect.map((layout) => buildReport(bytes, layout)),
	);

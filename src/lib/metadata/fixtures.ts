// Byte-level builders for the metadata tests. Test-only: nothing in the app
// imports this module.

const enc = new TextEncoder();
export const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

export const concat = (...parts: ReadonlyArray<Uint8Array | number[]>) => {
	const arrays = parts.map((p) =>
		p instanceof Uint8Array ? p : Uint8Array.from(p),
	);

	const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
	let at = 0;

	for (const a of arrays) {
		out.set(a, at);
		at += a.length;
	}

	return out;
};

// [tag, type, value]. Type 2 ASCII, 3 SHORT, 4 LONG, 5 RATIONAL (pairs).
export type Tag = readonly [number, 2 | 3 | 4 | 5, string | number | number[]];

export const tiff = (
	ifd0: ReadonlyArray<Tag>,
	opts: {
		exif?: ReadonlyArray<Tag>;
		gps?: ReadonlyArray<Tag>;
		le?: boolean;
		thumbnail?: boolean;
	} = {},
): Uint8Array => {
	const le = opts.le ?? false;
	const first: Tag[] = [...ifd0];

	if (opts.exif) first.push([0x8769, 4, 0]);

	if (opts.gps) first.push([0x8825, 4, 0]);

	const ifds = [first, opts.exif, opts.gps].filter(
		(x): x is Tag[] => x !== undefined,
	);

	let at = 8;

	const offsets = ifds.map((entries) => {
		const o = at;
		at += 2 + entries.length * 12 + 4;

		return o;
	});

	const pointer = (tag: number) =>
		tag === 0x8769 ? offsets[1] : offsets[opts.exif ? 2 : 1];

	const buf = new Uint8Array(at + 4096);
	const dv = new DataView(buf.buffer);
	buf.set(bytes(le ? "II" : "MM"), 0);
	dv.setUint16(2, 42, le);
	dv.setUint32(4, 8, le);
	let dataAt = at;

	ifds.forEach((entries, k) => {
		let p = offsets[k];
		dv.setUint16(p, entries.length, le);
		p += 2;

		for (const [tag, type, raw] of entries) {
			const value = tag === 0x8769 || tag === 0x8825 ? pointer(tag) : raw;
			let data: Uint8Array;
			let count: number;

			if (type === 2) {
				data = concat(enc.encode(String(value)), [0]);
				count = data.length;
			} else {
				const nums = Array.isArray(value) ? value : [Number(value)];
				const width = type === 3 ? 2 : 4;
				data = new Uint8Array(nums.length * width);
				const d = new DataView(data.buffer);
				nums.forEach((n, i) => {
					if (width === 2) d.setUint16(i * 2, n, le);
					else d.setUint32(i * 4, n, le);
				});
				count = type === 5 ? nums.length / 2 : nums.length;
			}

			dv.setUint16(p, tag, le);
			dv.setUint16(p + 2, type, le);
			dv.setUint32(p + 4, count, le);

			if (data.length <= 4) {
				buf.set(data, p + 8);
			} else {
				dv.setUint32(p + 8, dataAt, le);
				buf.set(data, dataAt);
				dataAt += data.length;
			}

			p += 12;
		}

		dv.setUint32(p, k === 0 && opts.thumbnail ? 999 : 0, le);
	});

	return buf.slice(0, dataAt);
};

// --- JPEG -------------------------------------------------------------------

export const segment = (marker: number, data: Uint8Array) =>
	concat(
		[0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff],
		data,
	);

export const APP0_JFIF = segment(
	0xe0,
	bytes("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"),
);

export const APP2_ICC = segment(
	0xe2,
	bytes("ICC_PROFILE\0\x01\x01fake-profile"),
);

export const APP14_ADOBE = segment(0xee, bytes("Adobe\0\x64\0\0\0\0\x01"));
export const DQT = segment(0xdb, new Uint8Array(65).fill(7));

export const SCAN = concat(
	segment(0xda, Uint8Array.from([1, 1, 0, 0, 0x3f, 0])),
	[0x12, 0x34, 0xff, 0x00, 0x56],
	[0xff, 0xd9],
);

export const exifSegment = (block: Uint8Array) =>
	segment(0xe1, concat(bytes("Exif\0\0"), block));

export const XMP_SEGMENT = segment(
	0xe1,
	bytes("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>secret</x:xmpmeta>"),
);

export const COM_SEGMENT = segment(0xfe, bytes("hello"));

export const jpeg = (...segments: Uint8Array[]) =>
	concat([0xff, 0xd8], ...segments, DQT, SCAN);

// --- PNG --------------------------------------------------------------------

// Readers ignore CRCs, so fixtures use a fixed fake one.
export const chunk = (type: string, data: Uint8Array) => {
	const head = new Uint8Array(8);
	new DataView(head.buffer).setUint32(0, data.length);
	head.set(bytes(type), 4);

	return concat(head, data, [0xde, 0xad, 0xbe, 0xef]);
};

export const PNG_SIG = bytes("\x89PNG\r\n\x1a\n");
export const IHDR = chunk("IHDR", new Uint8Array(13).fill(1));
export const ICCP = chunk("iCCP", bytes("sRGB\0\0zz"));
export const IDAT = chunk("IDAT", Uint8Array.from([9, 8, 7, 6]));
export const IEND = chunk("IEND", new Uint8Array(0));

// --- WebP -------------------------------------------------------------------

export const riffChunk = (type: string, data: Uint8Array) => {
	const head = new Uint8Array(8);
	head.set(bytes(type), 0);
	new DataView(head.buffer).setUint32(4, data.length, true);

	return concat(head, data, data.length & 1 ? [0] : []);
};

export const webp = (...chunks: Uint8Array[]) => {
	const body = concat(bytes("WEBP"), ...chunks);
	const head = new Uint8Array(8);
	head.set(bytes("RIFF"), 0);
	new DataView(head.buffer).setUint32(4, body.length, true);

	return concat(head, body);
};

// VP8X with ICC + EXIF + XMP flags set, 1x1 canvas.
export const VP8X = riffChunk(
	"VP8X",
	Uint8Array.from([0x20 | 0x08 | 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
);

export const VP8 = riffChunk("VP8 ", Uint8Array.from([1, 2, 3, 4, 5]));

// --- Common EXIF ------------------------------------------------------------

export const PHONE_EXIF: Tag[] = [
	[0x010f, 2, "Apple"],
	[0x0110, 2, "iPhone 15 Pro"],
	[0x0131, 2, "17.1"],
];

export const PHONE_EXIF_IFD: Tag[] = [
	[0x9003, 2, "2024:05:01 10:22:33"],
	[0xa434, 2, "iPhone 15 Pro back camera"],
	[0x829a, 5, [1, 120]],
];

// 48°51'30.24" N, 2°17'40.2" E (Eiffel Tower).
export const PARIS_GPS: Tag[] = [
	[1, 2, "N"],
	[2, 5, [48, 1, 51, 1, 3024, 100]],
	[3, 2, "E"],
	[4, 5, [2, 1, 17, 1, 402, 10]],
	[6, 5, [35, 1]],
];

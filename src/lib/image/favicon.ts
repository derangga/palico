import { Effect, Schema } from "effect";

import { DecodeError, EncodeError, FileTooLargeError } from "./errors.ts";
import { MAX_FILE_BYTES } from "./types.ts";
import { createZip } from "./zip.ts";

export const FaviconAsset = Schema.Struct({
	name: Schema.String,
	size: Schema.Number,
	mime: Schema.String,
	blob: Schema.instanceOf(Blob),
	bytes: Schema.Uint8Array,
});
export type FaviconAsset = Schema.Schema.Type<typeof FaviconAsset>;

// File-local — not migrated to Schema (internal config, never crosses a boundary).
interface PngSpec {
	readonly name: string;
	readonly size: number;
	readonly flattenWhite: boolean;
}

// Canonical favicon set. Apple touch icon is the only one flattened — iOS
// renders transparent pixels as black, which looks broken for most logos.
const PNG_SPECS: ReadonlyArray<PngSpec> = [
	{ name: "favicon-16.png", size: 16, flattenWhite: false },
	{ name: "favicon-32.png", size: 32, flattenWhite: false },
	{ name: "favicon-64.png", size: 64, flattenWhite: false },
	{ name: "apple-touch-icon.png", size: 180, flattenWhite: true },
	{ name: "android-chrome-192.png", size: 192, flattenWhite: false },
	{ name: "android-chrome-512.png", size: 512, flattenWhite: false },
];

const ICO_SIZES = [16, 32, 48] as const;

const validateSize = (file: File): Effect.Effect<void, FileTooLargeError> =>
	file.size > MAX_FILE_BYTES
		? Effect.fail(
				new FileTooLargeError({
					fileName: file.name,
					size: file.size,
					limit: MAX_FILE_BYTES,
					message: `"${file.name}" is larger than the ${Math.round(
						MAX_FILE_BYTES / (1024 * 1024),
					)} MB limit.`,
				}),
			)
		: Effect.void;

// Acquire a decoded ImageBitmap and guarantee it is closed on success, failure,
// and interruption. The bitmap is reused across every PNG draw, so explicit
// resource management is required (unlike resizer.ts which closes inline).
const withDecodedBitmap = <A, E>(
	file: File,
	use: (bitmap: ImageBitmap) => Effect.Effect<A, E>,
): Effect.Effect<A, E | DecodeError> =>
	Effect.acquireUseRelease(
		Effect.tryPromise({
			try: () => createImageBitmap(file),
			catch: (err) =>
				new DecodeError({
					fileName: file.name,
					message:
						err instanceof Error ? err.message : "Could not decode image.",
				}),
		}),
		use,
		(bitmap) => Effect.sync(() => bitmap.close()),
	);

// Largest centered square inside the source. Cover-style crop, no stretching.
function centerCrop(bitmap: ImageBitmap): {
	sx: number;
	sy: number;
	side: number;
} {
	const side = Math.min(bitmap.width, bitmap.height);
	return {
		sx: Math.floor((bitmap.width - side) / 2),
		sy: Math.floor((bitmap.height - side) / 2),
		side,
	};
}

function drawFavicon(
	bitmap: ImageBitmap,
	size: number,
	flattenWhite: boolean,
): OffscreenCanvas {
	const { sx, sy, side } = centerCrop(bitmap);
	const canvas = new OffscreenCanvas(size, size);
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not get a 2D canvas context.");
	if (flattenWhite) {
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, size, size);
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
	return canvas;
}

const encodePng = (
	bitmap: ImageBitmap,
	fileName: string,
	spec: PngSpec,
): Effect.Effect<FaviconAsset, EncodeError> =>
	Effect.gen(function* () {
		const canvas = yield* Effect.try({
			try: () => drawFavicon(bitmap, spec.size, spec.flattenWhite),
			catch: (err) =>
				new EncodeError({
					fileName,
					format: "png",
					message:
						err instanceof Error ? err.message : "Could not draw favicon.",
				}),
		});
		const blob = yield* Effect.tryPromise({
			try: () => canvas.convertToBlob({ type: "image/png" }),
			catch: (err) =>
				new EncodeError({
					fileName,
					format: "png",
					message: err instanceof Error ? err.message : "Could not encode PNG.",
				}),
		});
		const buffer = yield* Effect.tryPromise({
			try: () => blob.arrayBuffer(),
			catch: (err) =>
				new EncodeError({
					fileName,
					format: "png",
					message:
						err instanceof Error ? err.message : "Could not read PNG bytes.",
				}),
		});
		const bytes = new Uint8Array(buffer);
		return {
			name: spec.name,
			size: spec.size,
			mime: "image/png",
			blob,
			bytes,
		} satisfies FaviconAsset;
	});

// Pack already-encoded PNG bytes into a multi-resolution .ico file. Modern .ico
// permits embedded PNG payloads (Vista+ — universal browser/OS support today),
// so we skip the BMP DIB path entirely.
function encodeIco(
	entries: ReadonlyArray<{ size: number; bytes: Uint8Array }>,
): Uint8Array {
	const HEADER_BYTES = 6;
	const ENTRY_BYTES = 16;
	const directoryBytes = HEADER_BYTES + ENTRY_BYTES * entries.length;
	const payloadBytes = entries.reduce((n, e) => n + e.bytes.byteLength, 0);
	const out = new Uint8Array(directoryBytes + payloadBytes);
	const view = new DataView(out.buffer);

	// ICONDIR
	view.setUint16(0, 0, true); // reserved
	view.setUint16(2, 1, true); // type = 1 (icon)
	view.setUint16(4, entries.length, true);

	// ICONDIRENTRYs + payload
	let payloadOffset = directoryBytes;
	entries.forEach((entry, i) => {
		const recordOffset = HEADER_BYTES + ENTRY_BYTES * i;
		// 256 is encoded as 0 per the .ico spec; our sizes are all <= 48 so a
		// direct cast is fine but we apply the encoding rule defensively.
		const dim = entry.size >= 256 ? 0 : entry.size;
		out[recordOffset + 0] = dim; // width
		out[recordOffset + 1] = dim; // height
		out[recordOffset + 2] = 0; // color count
		out[recordOffset + 3] = 0; // reserved
		view.setUint16(recordOffset + 4, 1, true); // color planes
		view.setUint16(recordOffset + 6, 32, true); // bits per pixel
		view.setUint32(recordOffset + 8, entry.bytes.byteLength, true);
		view.setUint32(recordOffset + 12, payloadOffset, true);
		out.set(entry.bytes, payloadOffset);
		payloadOffset += entry.bytes.byteLength;
	});
	return out;
}

const buildIcoAsset = (
	bitmap: ImageBitmap,
	fileName: string,
): Effect.Effect<FaviconAsset, EncodeError> =>
	Effect.gen(function* () {
		const pngs = yield* Effect.all(
			ICO_SIZES.map((size) =>
				encodePng(bitmap, fileName, {
					name: `__ico-${size}.png`,
					size,
					flattenWhite: false,
				}),
			),
			{ concurrency: "unbounded" },
		);
		const bytes = encodeIco(
			pngs.map((p) => ({ size: p.size, bytes: p.bytes })),
		);
		const blob = new Blob([bytes as BlobPart], { type: "image/x-icon" });
		return {
			name: "favicon.ico",
			size: 32,
			mime: "image/x-icon",
			blob,
			bytes,
		} satisfies FaviconAsset;
	});

export const generateFavicons = Effect.fn("favicon.generate")(function* (
	file: File,
) {
	yield* validateSize(file);
	return yield* withDecodedBitmap(file, (bitmap) =>
		Effect.gen(function* () {
			const pngs = yield* Effect.all(
				PNG_SPECS.map((spec) => encodePng(bitmap, file.name, spec)),
				{ concurrency: "unbounded" },
			);
			const ico = yield* buildIcoAsset(bitmap, file.name);
			return [...pngs, ico] as ReadonlyArray<FaviconAsset>;
		}),
	);
});

const WEBMANIFEST = JSON.stringify(
	{
		name: "",
		short_name: "",
		icons: [
			{
				src: "/android-chrome-192.png",
				sizes: "192x192",
				type: "image/png",
				purpose: "any maskable",
			},
			{
				src: "/android-chrome-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "any maskable",
			},
		],
		theme_color: "#ffffff",
		background_color: "#ffffff",
		display: "standalone",
	},
	null,
	2,
);

const HEAD_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
`;

const textBytes = (s: string) => new TextEncoder().encode(s);

export const bundleFaviconZip = (assets: ReadonlyArray<FaviconAsset>) => {
	const files: Record<string, Uint8Array> = {
		"site.webmanifest": textBytes(WEBMANIFEST),
		"head-snippet.html": textBytes(HEAD_SNIPPET),
	};
	for (const asset of assets) files[asset.name] = asset.bytes;
	return createZip(files);
};

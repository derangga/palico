// For a Blob made without a type, or a file unpacked from a zip. The menu
// matches on MIME type, and the target page checks `file.type` the same way it
// checks a dropped file.
const TYPE_BY_EXTENSION = new Map(
	Object.entries({
		pdf: "application/pdf",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
		avif: "image/avif",
		gif: "image/gif",
		ico: "image/x-icon",
		svg: "image/svg+xml",
		bmp: "image/bmp",
		tif: "image/tiff",
		tiff: "image/tiff",
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		mkv: "video/x-matroska",
		m4v: "video/x-m4v",
		avi: "video/x-msvideo",
		"3gp": "video/3gpp",
		mp3: "audio/mpeg",
		m4a: "audio/mp4",
		aac: "audio/aac",
		wav: "audio/wav",
		ogg: "audio/ogg",
		opus: "audio/opus",
		flac: "audio/flac",
	}),
);

/** The MIME type for a file name's extension, or "" when it is not known. */
export const typeFromName = (name: string): string =>
	TYPE_BY_EXTENSION.get(name.split(".").pop()?.toLowerCase() ?? "") ?? "";

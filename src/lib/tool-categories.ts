import {
	AudioLines,
	AudioWaveform,
	Braces,
	CalendarClock,
	Combine,
	Eraser,
	EyeOff,
	FileDiff,
	FileDown,
	FileStack,
	FileText,
	Film,
	ImageIcon,
	ImagePlay,
	Images,
	KeyRound,
	LayoutGrid,
	LockKeyhole,
	type LucideIcon,
	Minimize2,
	Palette,
	Pipette,
	QrCode,
	Scaling,
	ScanQrCode,
	Scissors,
	ScrollText,
	Shrink,
	Star,
} from "lucide-react";

import type { Locale } from "#/lib/i18n/shapes.ts";
import type { EngineId } from "#/lib/offline/shapes.ts";
import { m } from "#/paraglide/messages.js";

/**
 * The one registry of tools. The home grid and the sidebar both read it.
 * Grouping follows DESIGN.md: Image (Mauve + Pink), Video & Audio (Peach +
 * Yellow, id "video"), File (Teal + Green), Color (Blue + Sapphire), Developer
 * (Lavender + Flamingo).
 */
export type ToolCategory = "image" | "video" | "file" | "color" | "developer";

/** The words a person can search a tool by, in one language. */
export type ToolText = {
	label: string;
	blurb: string;
	/** Extra search terms (formats, synonyms) the label and blurb miss. Name only what the tool really does. */
	keywords: ReadonlyArray<string>;
};

/**
 * The text fields read the active language each time, so a component that
 * re-renders after a language switch shows the new one. Copy a tool with
 * `{ ...tool }` and you freeze the text; pass the tool itself.
 */
export type Tool = {
	to: string;
	label: string;
	blurb: string;
	keywords: ReadonlyArray<string>;
	/** Page <title> and meta description (see src/lib/seo.ts). Keep the title under 50 characters and the description under 160, in every language. */
	seoTitle: string;
	seoDescription: string;
	/** The short name in the top bar breadcrumb. */
	crumb: string;
	/** The text in one language, for search to match in English as well as the active one. */
	textIn: (locale: Locale) => ToolText;
	icon: LucideIcon;
	category: ToolCategory;
	/** The opt-in download this tool needs, if any (drives the offline pill). */
	engine?: EngineId;
	id: ToolId;
	/**
	 * The file types this tool takes, as MIME types or patterns such as
	 * `image/*`. Empty for a tool that takes no file. "Send to..." lists a tool
	 * only when it accepts every output being sent (see docs/chain-tools.md).
	 */
	accepts: ReadonlyArray<string>;
	/** The best next steps after this tool, listed first in "Send to...". */
	next: ReadonlyArray<ToolId>;
};

export const CATEGORIES: ReadonlyArray<{
	id: ToolCategory;
	readonly label: string;
}> = [
	{
		id: "image",
		get label() {
			return m.category_image();
		},
	},
	{
		id: "video",
		get label() {
			return m.category_video();
		},
	},
	{
		id: "file",
		get label() {
			return m.category_file();
		},
	},
	{
		id: "color",
		get label() {
			return m.category_color();
		},
	},
	{
		id: "developer",
		get label() {
			return m.category_developer();
		},
	},
];

export type ToolId =
	| "converter"
	| "resizer"
	| "compressor"
	| "background_removal"
	| "favicon_generator"
	| "video_converter"
	| "video_cutter"
	| "video_compressor"
	| "video_to_gif"
	| "extract_audio"
	| "audio_cutter"
	| "markdown_preview"
	| "diff_viewer"
	| "pdf_split"
	| "pdf_merge"
	| "pdf_organize"
	| "pdf_compress"
	| "pdf_to_images"
	| "office_to_pdf"
	| "strip_metadata"
	| "qr_generator"
	| "qr_reader"
	| "palette_extractor"
	| "color_picker"
	| "cron_generator"
	| "json_converter"
	| "jwt_decoder"
	| "pdf_password";

const splitKeywords = (text: string) =>
	text
		.split(",")
		.map((word) => word.trim())
		.filter((word) => word !== "");

// `locale` undefined means the active language.
const callOptions = (locale: Locale | undefined) =>
	locale === undefined ? undefined : { locale };

function defineTool(
	id: ToolId,
	spec: Pick<Tool, "to" | "icon" | "category" | "engine" | "accepts"> & {
		readonly next?: ReadonlyArray<ToolId>;
	},
): Tool {
	const textIn = (locale?: Locale): ToolText => ({
		label: m[`tool_${id}_label` as const]({}, callOptions(locale)),
		blurb: m[`tool_${id}_blurb` as const]({}, callOptions(locale)),
		keywords: splitKeywords(
			m[`tool_${id}_keywords` as const]({}, callOptions(locale)),
		),
	});

	return {
		...spec,
		id,
		next: spec.next ?? [],
		get label() {
			return textIn().label;
		},
		get blurb() {
			return textIn().blurb;
		},
		get keywords() {
			return textIn().keywords;
		},
		get seoTitle() {
			return m[`tool_${id}_seo_title` as const]();
		},
		get seoDescription() {
			return m[`tool_${id}_seo_description` as const]();
		},
		get crumb() {
			return m[`tool_${id}_crumb` as const]();
		},
		textIn,
	};
}

// What each tool takes, for "Send to..." (docs/chain-tools.md). Keep these in
// step with the tool's dropzone `accept`.
const IMAGES = ["image/*"];
const VIDEOS = ["video/*"];
const AUDIO = ["audio/*"];
const PDF = ["application/pdf"];
const NO_FILE: Tool["accepts"] = [];
// The Office tool's dropzone goes by extension. These are the MIME types a
// browser gives the same files. No palico tool outputs them yet.
const OFFICE_DOCS = [
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/msword",
	"application/vnd.oasis.opendocument.text",
	"application/rtf",
	"text/rtf",
];
// The same list as ACCEPTED_MIME_TYPES in src/lib/metadata/types.ts.
const METADATA_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"application/pdf",
];

export const TOOLS: ReadonlyArray<Tool> = [
	defineTool("converter", {
		to: "/converter",
		icon: ImageIcon,
		category: "image",
		accepts: IMAGES,
		next: ["strip_metadata", "compressor"],
	}),
	defineTool("resizer", {
		to: "/resizer",
		icon: Scaling,
		category: "image",
		accepts: IMAGES,
		next: ["compressor", "strip_metadata", "favicon_generator"],
	}),
	defineTool("compressor", {
		to: "/compressor",
		icon: Shrink,
		category: "image",
		accepts: IMAGES,
		next: ["strip_metadata", "resizer"],
	}),
	defineTool("background_removal", {
		to: "/background-removal",
		icon: Eraser,
		category: "image",
		engine: "bg-model",
		accepts: IMAGES,
		next: ["resizer", "favicon_generator"],
	}),
	defineTool("favicon_generator", {
		to: "/favicon-generator",
		icon: Star,
		category: "image",
		accepts: IMAGES,
	}),
	defineTool("video_converter", {
		to: "/video-converter",
		icon: Film,
		category: "video",
		engine: "ffmpeg",
		accepts: VIDEOS,
		next: ["video_cutter", "video_compressor", "video_to_gif"],
	}),
	defineTool("video_cutter", {
		to: "/video-cutter",
		icon: Scissors,
		category: "video",
		engine: "ffmpeg",
		accepts: VIDEOS,
		next: ["video_to_gif", "video_compressor", "extract_audio"],
	}),
	defineTool("video_compressor", {
		to: "/video-compressor",
		icon: Minimize2,
		category: "video",
		engine: "ffmpeg",
		accepts: VIDEOS,
		next: ["video_cutter", "extract_audio"],
	}),
	defineTool("video_to_gif", {
		to: "/video-to-gif",
		icon: ImagePlay,
		category: "video",
		engine: "ffmpeg",
		accepts: VIDEOS,
		next: ["converter"],
	}),
	defineTool("extract_audio", {
		to: "/extract-audio",
		icon: AudioLines,
		category: "video",
		engine: "ffmpeg",
		accepts: VIDEOS,
		next: ["audio_cutter"],
	}),
	defineTool("audio_cutter", {
		to: "/audio-cutter",
		icon: AudioWaveform,
		category: "video",
		engine: "ffmpeg",
		accepts: AUDIO,
	}),
	defineTool("markdown_preview", {
		to: "/markdown-preview",
		icon: ScrollText,
		category: "developer",
		accepts: NO_FILE,
	}),
	defineTool("diff_viewer", {
		to: "/diff-viewer",
		icon: FileDiff,
		category: "developer",
		accepts: NO_FILE,
	}),
	defineTool("pdf_split", {
		to: "/pdf-split",
		icon: FileStack,
		category: "file",
		accepts: PDF,
		next: ["pdf_compress", "pdf_merge", "pdf_to_images"],
	}),
	defineTool("pdf_merge", {
		to: "/pdf-merge",
		icon: Combine,
		category: "file",
		accepts: PDF,
		next: ["pdf_compress", "pdf_organize", "pdf_password"],
	}),
	defineTool("pdf_organize", {
		to: "/pdf-organize",
		icon: LayoutGrid,
		category: "file",
		accepts: PDF,
		next: ["pdf_compress", "pdf_password", "pdf_split"],
	}),
	defineTool("pdf_compress", {
		to: "/pdf-compress",
		icon: FileDown,
		category: "file",
		accepts: PDF,
		next: ["pdf_password", "pdf_merge", "pdf_split"],
	}),
	defineTool("pdf_to_images", {
		to: "/pdf-to-images",
		icon: Images,
		category: "file",
		accepts: PDF,
		next: ["compressor", "strip_metadata"],
	}),
	defineTool("office_to_pdf", {
		to: "/office-to-pdf",
		icon: FileText,
		category: "file",
		engine: "office",
		accepts: OFFICE_DOCS,
		next: ["pdf_compress", "pdf_password", "pdf_merge"],
	}),
	defineTool("pdf_password", {
		to: "/pdf-password",
		icon: LockKeyhole,
		category: "file",
		engine: "qpdf",
		accepts: PDF,
		next: ["pdf_compress", "pdf_organize", "pdf_to_images"],
	}),
	defineTool("strip_metadata", {
		to: "/strip-metadata",
		icon: EyeOff,
		category: "file",
		accepts: METADATA_TYPES,
		next: ["compressor", "pdf_compress", "converter"],
	}),
	defineTool("qr_generator", {
		to: "/qr-generator",
		icon: QrCode,
		category: "file",
		accepts: NO_FILE,
		next: ["compressor", "converter"],
	}),
	defineTool("qr_reader", {
		to: "/qr-reader",
		icon: ScanQrCode,
		category: "file",
		accepts: IMAGES,
	}),
	defineTool("palette_extractor", {
		to: "/palette-extractor",
		icon: Palette,
		category: "color",
		accepts: IMAGES,
	}),
	defineTool("color_picker", {
		to: "/color-picker",
		icon: Pipette,
		category: "color",
		accepts: IMAGES,
	}),
	defineTool("cron_generator", {
		to: "/cron-generator",
		icon: CalendarClock,
		category: "developer",
		accepts: NO_FILE,
	}),
	defineTool("json_converter", {
		to: "/json-converter",
		icon: Braces,
		category: "developer",
		accepts: NO_FILE,
	}),
	defineTool("jwt_decoder", {
		to: "/jwt-decoder",
		icon: KeyRound,
		category: "developer",
		accepts: NO_FILE,
	}),
];

export const toolGroups = CATEGORIES.map((category) => ({
	id: category.id,
	// A getter, not a spread: a spread would copy the label once, in the language
	// active when this module loaded.
	get label() {
		return category.label;
	},
	tools: TOOLS.filter((tool) => tool.category === category.id),
}));

/**
 * Class maps per category. Latte rule: only Mauve, Red and large Blue carry
 * text, so every other accent is a fill, a tint or an icon, with a
 * foreground label on top.
 * - `fill`: solid accent (dots, edges).
 * - `chip`: accent tint for an icon chip or label chip.
 * - `tint`: the second accent of the pair, as a quiet tint.
 * - `ink`: for icons on a quiet surface. Latte pulls the accent 30% toward the
 *   foreground (about 3:1 or better); Mocha uses the accent as is.
 * - `vars`: sets `--tile-edge` and `--tile-tint` for the home tile CSS.
 */
export const CATEGORY_STYLES: Record<
	ToolCategory,
	{
		label: string;
		fill: string;
		chip: string;
		tint: string;
		ink: string;
		vars: string;
	}
> = {
	image: {
		get label() {
			return m.category_image();
		},
		fill: "bg-cat-image",
		chip: "bg-cat-image/20",
		tint: "bg-cat-image-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-image),var(--foreground)_30%)] dark:text-cat-image",
		vars: "[--tile-edge:var(--cat-image)] [--tile-tint:var(--cat-image-2)]",
	},
	video: {
		get label() {
			return m.category_video();
		},
		fill: "bg-cat-video",
		chip: "bg-cat-video/20",
		tint: "bg-cat-video-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-video),var(--foreground)_30%)] dark:text-cat-video",
		vars: "[--tile-edge:var(--cat-video)] [--tile-tint:var(--cat-video-2)]",
	},
	file: {
		get label() {
			return m.category_file();
		},
		fill: "bg-cat-file",
		chip: "bg-cat-file/20",
		tint: "bg-cat-file-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-file),var(--foreground)_30%)] dark:text-cat-file",
		vars: "[--tile-edge:var(--cat-file)] [--tile-tint:var(--cat-file-2)]",
	},
	color: {
		get label() {
			return m.category_color();
		},
		fill: "bg-cat-color",
		chip: "bg-cat-color/20",
		tint: "bg-cat-color-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-color),var(--foreground)_30%)] dark:text-cat-color",
		vars: "[--tile-edge:var(--cat-color)] [--tile-tint:var(--cat-color-2)]",
	},
	developer: {
		get label() {
			return m.category_developer();
		},
		fill: "bg-cat-developer",
		chip: "bg-cat-developer/20",
		tint: "bg-cat-developer-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-developer),var(--foreground)_30%)] dark:text-cat-developer",
		vars: "[--tile-edge:var(--cat-developer)] [--tile-tint:var(--cat-developer-2)]",
	},
};

import {
	AudioLines,
	Combine,
	Eraser,
	EyeOff,
	FileDiff,
	FileStack,
	FileText,
	Film,
	ImageIcon,
	ImagePlay,
	Images,
	LayoutGrid,
	type LucideIcon,
	Minimize2,
	Scaling,
	Scissors,
	ScrollText,
	Shrink,
	Star,
} from "lucide-react";

import type { EngineId } from "#/lib/offline/shapes.ts";

/**
 * The one registry of tools. The home grid and the sidebar both read it, and
 * `categoryOfPath` lets any page find its category from the URL.
 * Grouping follows DESIGN.md: Image (Mauve + Pink), Video (Peach + Yellow),
 * File (Teal + Green).
 */
export type ToolCategory = "image" | "video" | "file";

export type Tool = {
	to: string;
	label: string;
	blurb: string;
	icon: LucideIcon;
	category: ToolCategory;
	/** The opt-in download this tool needs, if any (drives the offline pill). */
	engine?: EngineId;
};

export const CATEGORIES: ReadonlyArray<{ id: ToolCategory; label: string }> = [
	{ id: "image", label: "Image" },
	{ id: "video", label: "Video" },
	{ id: "file", label: "File" },
];

export const TOOLS: ReadonlyArray<Tool> = [
	{
		to: "/converter",
		label: "Image Converter",
		blurb: "Convert images to JPG, PNG or WebP.",
		icon: ImageIcon,
		category: "image",
	},
	{
		to: "/resizer",
		label: "Image Resizer",
		blurb: "Resize by pixels or percentage.",
		icon: Scaling,
		category: "image",
	},
	{
		to: "/compressor",
		label: "Compress Image",
		blurb: "Make images smaller without resizing.",
		icon: Shrink,
		category: "image",
	},
	{
		to: "/background-removal",
		label: "Remove Background",
		blurb: "Cut out the subject of any image.",
		icon: Eraser,
		category: "image",
		engine: "bg-model",
	},
	{
		to: "/favicon-generator",
		label: "Favicon Generator",
		blurb: "Every favicon size from one logo.",
		icon: Star,
		category: "image",
	},
	{
		to: "/video-converter",
		label: "Video Converter",
		blurb: "Convert to MP4, WebM, MOV, MKV or AVI.",
		icon: Film,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-cutter",
		label: "Video Cutter",
		blurb: "Trim a clip out of any video.",
		icon: Scissors,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-compressor",
		label: "Compress Video",
		blurb: "Shrink a video to fit an upload limit.",
		icon: Minimize2,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-to-gif",
		label: "Video to GIF",
		blurb: "Turn a short clip into an animated GIF.",
		icon: ImagePlay,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/extract-audio",
		label: "Extract Audio",
		blurb: "Save the sound of a video as MP3, M4A, Opus or WAV.",
		icon: AudioLines,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/markdown-preview",
		label: "Markdown Preview",
		blurb: "Type Markdown, see it rendered live.",
		icon: ScrollText,
		category: "file",
	},
	{
		to: "/diff-viewer",
		label: "Diff Viewer",
		blurb: "Compare two texts side by side.",
		icon: FileDiff,
		category: "file",
	},
	{
		to: "/pdf-split",
		label: "Split PDF",
		blurb: "Pull pages out of a PDF.",
		icon: FileStack,
		category: "file",
	},
	{
		to: "/pdf-merge",
		label: "Merge PDFs",
		blurb: "Combine several PDFs into one.",
		icon: Combine,
		category: "file",
	},
	{
		to: "/pdf-organize",
		label: "Organize PDF",
		blurb: "Rotate, delete and reorder pages.",
		icon: LayoutGrid,
		category: "file",
	},
	{
		to: "/pdf-to-images",
		label: "PDF to Images",
		blurb: "Save every page as a JPG or PNG.",
		icon: Images,
		category: "file",
	},
	{
		to: "/office-to-pdf",
		label: "Word to PDF",
		blurb: "Turn Word, ODT and RTF files into PDF.",
		icon: FileText,
		category: "file",
		engine: "office",
	},
	{
		to: "/strip-metadata",
		label: "Remove Metadata",
		blurb: "See and remove hidden data in photos and PDFs.",
		icon: EyeOff,
		category: "file",
	},
];

export const toolGroups = CATEGORIES.map((category) => ({
	...category,
	tools: TOOLS.filter((tool) => tool.category === category.id),
}));

export function categoryOfPath(pathname: string): ToolCategory | undefined {
	return TOOLS.find((tool) => pathname.startsWith(tool.to))?.category;
}

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
		label: "Image",
		fill: "bg-cat-image",
		chip: "bg-cat-image/20",
		tint: "bg-cat-image-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-image),var(--foreground)_30%)] dark:text-cat-image",
		vars: "[--tile-edge:var(--cat-image)] [--tile-tint:var(--cat-image-2)]",
	},
	video: {
		label: "Video",
		fill: "bg-cat-video",
		chip: "bg-cat-video/20",
		tint: "bg-cat-video-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-video),var(--foreground)_30%)] dark:text-cat-video",
		vars: "[--tile-edge:var(--cat-video)] [--tile-tint:var(--cat-video-2)]",
	},
	file: {
		label: "File",
		fill: "bg-cat-file",
		chip: "bg-cat-file/20",
		tint: "bg-cat-file-2/15",
		ink: "text-[color-mix(in_oklab,var(--cat-file),var(--foreground)_30%)] dark:text-cat-file",
		vars: "[--tile-edge:var(--cat-file)] [--tile-tint:var(--cat-file-2)]",
	},
};

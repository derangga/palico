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
	/** Page <title> and meta description (see src/lib/seo.ts). Keep the title under 50 characters and the description under 160. */
	seoTitle: string;
	seoDescription: string;
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
		seoTitle: "Free Image Converter (JPG, PNG, WebP)",
		seoDescription:
			"Convert images to JPG, PNG or WebP in your browser. Files never leave your device, so there is no upload and no sign-up, and it works offline.",
		icon: ImageIcon,
		category: "image",
	},
	{
		to: "/resizer",
		label: "Image Resizer",
		blurb: "Resize by pixels or percentage.",
		seoTitle: "Image Resizer by Pixels or Percent",
		seoDescription:
			"Resize images by exact pixels or by percentage in your browser. Nothing is uploaded, no account is needed, and it works offline.",
		icon: Scaling,
		category: "image",
	},
	{
		to: "/compressor",
		label: "Compress Image",
		blurb: "Make images smaller without resizing.",
		seoTitle: "Compress Images Without Resizing",
		seoDescription:
			"Make JPG, PNG and WebP files smaller while keeping their dimensions. Runs on your device with no upload, and works offline.",
		icon: Shrink,
		category: "image",
	},
	{
		to: "/background-removal",
		label: "Remove Background",
		blurb: "Cut out the subject of any image.",
		seoTitle: "Remove Image Background Offline",
		seoDescription:
			"Cut out the subject of any photo with an AI model that runs in your browser. The image is never uploaded. Works offline after a one-time model download.",
		icon: Eraser,
		category: "image",
		engine: "bg-model",
	},
	{
		to: "/favicon-generator",
		label: "Favicon Generator",
		blurb: "Every favicon size from one logo.",
		seoTitle: "Favicon Generator from One Logo",
		seoDescription:
			"Generate every favicon size from a single logo image. Runs in your browser with no upload and no sign-up.",
		icon: Star,
		category: "image",
	},
	{
		to: "/video-converter",
		label: "Video Converter",
		blurb: "Convert to MP4, WebM, MOV, MKV or AVI.",
		seoTitle: "Free Video Converter in Your Browser",
		seoDescription:
			"Convert video to MP4, WebM, MOV, MKV or AVI on your device. No upload and no sign-up. Works offline after a one-time engine download.",
		icon: Film,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-cutter",
		label: "Video Cutter",
		blurb: "Trim a clip out of any video.",
		seoTitle: "Video Cutter: Trim Any Clip",
		seoDescription:
			"Trim a clip out of any video without uploading it. Pick a start and an end, then save the cut. Runs in your browser and works offline.",
		icon: Scissors,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-compressor",
		label: "Compress Video",
		blurb: "Shrink a video to fit an upload limit.",
		seoTitle: "Compress Video to Fit an Upload Limit",
		seoDescription:
			"Shrink a video so it fits an email or upload limit. Runs in your browser with no upload, and works offline after a one-time engine download.",
		icon: Minimize2,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/video-to-gif",
		label: "Video to GIF",
		blurb: "Turn a short clip into an animated GIF.",
		seoTitle: "Video to GIF Converter",
		seoDescription:
			"Turn a short video clip into an animated GIF on your device. No upload, no sign-up, and it works offline after a one-time engine download.",
		icon: ImagePlay,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/extract-audio",
		label: "Extract Audio",
		blurb: "Save the sound of a video as MP3, M4A, Opus or WAV.",
		seoTitle: "Extract Audio from Video (MP3, M4A, WAV)",
		seoDescription:
			"Save the sound of a video as MP3, M4A, Opus or WAV. Runs in your browser, so the video never leaves your device.",
		icon: AudioLines,
		category: "video",
		engine: "ffmpeg",
	},
	{
		to: "/markdown-preview",
		label: "Markdown Preview",
		blurb: "Type Markdown, see it rendered live.",
		seoTitle: "Markdown Preview with Live Rendering",
		seoDescription:
			"Type Markdown and see it rendered live, with code highlighting and Mermaid diagrams. Runs in your browser and nothing is uploaded.",
		icon: ScrollText,
		category: "file",
	},
	{
		to: "/diff-viewer",
		label: "Diff Viewer",
		blurb: "Compare two texts side by side.",
		seoTitle: "Text Diff Viewer: Compare Two Texts",
		seoDescription:
			"Paste two versions of a text and see the differences side by side. Runs on your device and nothing is uploaded.",
		icon: FileDiff,
		category: "file",
	},
	{
		to: "/pdf-split",
		label: "Split PDF",
		blurb: "Pull pages out of a PDF.",
		seoTitle: "Split PDF: Extract Pages",
		seoDescription:
			"Pull pages or page ranges out of a PDF into a new file. Runs in your browser, so the PDF is never uploaded.",
		icon: FileStack,
		category: "file",
	},
	{
		to: "/pdf-merge",
		label: "Merge PDFs",
		blurb: "Combine several PDFs into one.",
		seoTitle: "Merge PDFs into One File",
		seoDescription:
			"Combine several PDFs into one document. Runs on your device with no upload and no sign-up.",
		icon: Combine,
		category: "file",
	},
	{
		to: "/pdf-organize",
		label: "Organize PDF",
		blurb: "Rotate, delete and reorder pages.",
		seoTitle: "Organize PDF: Rotate, Delete, Reorder",
		seoDescription:
			"Rotate, delete and reorder the pages of a PDF. Runs in your browser, so the file never leaves your device.",
		icon: LayoutGrid,
		category: "file",
	},
	{
		to: "/pdf-to-images",
		label: "PDF to Images",
		blurb: "Save every page as a JPG or PNG.",
		seoTitle: "PDF to JPG or PNG Converter",
		seoDescription:
			"Save every page of a PDF as a JPG or PNG image. Runs in your browser, so the file never leaves your device.",
		icon: Images,
		category: "file",
	},
	{
		to: "/office-to-pdf",
		label: "Word to PDF",
		blurb: "Turn Word, ODT and RTF files into PDF.",
		seoTitle: "Word to PDF Converter (DOCX, ODT, RTF)",
		seoDescription:
			"Turn Word, ODT and RTF files into PDF in your browser. No upload, and it works offline after a one-time engine download.",
		icon: FileText,
		category: "file",
		engine: "office",
	},
	{
		to: "/strip-metadata",
		label: "Remove Metadata",
		blurb: "See and remove hidden data in photos and PDFs.",
		seoTitle: "Remove Metadata from Photos and PDFs",
		seoDescription:
			"See the hidden data in your photos and PDFs, such as GPS location and camera details, then remove it. Runs on your device.",
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

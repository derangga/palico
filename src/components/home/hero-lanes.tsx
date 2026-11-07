import {
	Braces,
	Droplet,
	FileText,
	Film,
	ImageIcon,
	Lock,
	Minimize2,
	Palette,
	Scissors,
	type LucideIcon,
} from "lucide-react";

import type { ToolCategory } from "#/lib/tool-categories.ts";

// Each icon is a tool glyph in its category colour: peach for video, mauve for
// image, teal for file, blue for color, lavender for developer. The colour is set
// on the chip from `data-cat` (see home.css), so no default can override it.
type LaneIcon = {
	readonly name: string;
	readonly Icon: LucideIcon;
	readonly category: ToolCategory;
};

const icon = (
	name: string,
	Icon: LucideIcon,
	category: ToolCategory,
): LaneIcon => ({ name, Icon, category });

type Lane = {
	/** Which way the lane slides. */
	readonly dir: "up" | "down";
	/** Seconds for one pass of the five icons. Different per lane so they drift apart. */
	readonly seconds: number;
	/** Negative, so the page opens mid-loop instead of every lane at the start. */
	readonly delay: number;
	readonly icons: ReadonlyArray<LaneIcon>;
};

const LANES: ReadonlyArray<Lane> = [
	{
		dir: "up",
		seconds: 20,
		delay: -6,
		icons: [
			icon("scissors", Scissors, "video"),
			icon("image", ImageIcon, "image"),
			icon("file-text", FileText, "file"),
			icon("braces", Braces, "developer"),
			icon("minimize", Minimize2, "image"),
		],
	},
	{
		dir: "down",
		seconds: 24,
		delay: -14,
		icons: [
			icon("film", Film, "video"),
			icon("palette", Palette, "color"),
			icon("lock", Lock, "file"),
			icon("droplet", Droplet, "color"),
			icon("image", ImageIcon, "image"),
		],
	},
	{
		dir: "up",
		seconds: 22,
		delay: -2,
		icons: [
			icon("minimize", Minimize2, "video"),
			icon("file-text", FileText, "file"),
			icon("scissors", Scissors, "video"),
			icon("palette", Palette, "color"),
			icon("braces", Braces, "developer"),
		],
	},
];

// Each lane shows its set twice, so the loop has no jump.
const COPIES = [0, 1] as const;

/**
 * The slanted band of tool icons behind the home hero: three lanes leaning like
 * a slash, sliding up, down, up at a steady speed. Each lane holds its five icons
 * twice, so the `translateY(-50%)` loop ends exactly where it began. Decorative:
 * hidden from assistive tech. Motion, sizes and the pause rules live in
 * home.css; why in docs/home-page.md.
 */
export function HeroLanes() {
	return (
		<div aria-hidden className="hero-lanes">
			{LANES.map((lane) => (
				<div
					key={`${lane.dir}-${lane.seconds}`}
					className="hero-lane"
					data-dir={lane.dir}
					style={{
						animationDuration: `${lane.seconds}s`,
						animationDelay: `${lane.delay}s`,
					}}
				>
					{COPIES.flatMap((copy) =>
						lane.icons.map(({ name, Icon, category }) => (
							<span
								key={`${copy}-${name}`}
								className="hero-chip"
								data-cat={category}
							>
								<Icon />
							</span>
						)),
					)}
				</div>
			))}
		</div>
	);
}

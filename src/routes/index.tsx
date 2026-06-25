import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Eraser,
	ImageIcon,
	Lock,
	Scaling,
	ShieldCheck,
	Star,
	Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

const tools = [
	{
		to: "/converter",
		icon: ImageIcon,
		label: "Image\nConverter",
		className: "border-orange-400/40 bg-orange-500/20 text-orange-300",
	},
	{
		to: "/resizer",
		icon: Scaling,
		label: "Image\nResizer",
		className: "border-emerald-400/40 bg-emerald-500/20 text-emerald-300",
	},
	{
		to: "/background-removal",
		icon: Eraser,
		label: "Remove\nBackground",
		className: "border-sky-400/40 bg-sky-500/20 text-sky-300",
	},
	{
		to: "/favicon-generator",
		icon: Star,
		label: "Favicon\nGenerator",
		className: "border-amber-400/40 bg-amber-500/20 text-amber-300",
	},
] as const;

const badges = [
	{ icon: ShieldCheck, label: "Offline First" },
	{ icon: Lock, label: "Private & Secure" },
	{ icon: Zap, label: "Fast & Lightweight" },
] as const;

function Home() {
	return (
		<section
			className="relative flex min-h-[calc(100svh-3.5rem)] w-full flex-col items-start justify-center overflow-hidden px-6 py-16 text-left text-secondary-foreground sm:px-16"
			style={{
				backgroundImage: "url(/palico.png)",
				backgroundSize: "cover",
				backgroundPosition: "center",
			}}
		>
			<div className="relative mt-32 flex flex-col items-center">
				{/* Title + tagline */}
				<p className="mt-3 font-display text-3xl text-secondary-foreground drop-shadow sm:text-5xl">
					Your Daily Offline Toolkit
				</p>

				{/* Tool tiles */}
				<div className="mt-12 flex items-start justify-start gap-10 sm:gap-16">
					{tools.map((tool) => (
						<Link
							key={tool.to}
							to={tool.to}
							className="group flex w-24 flex-col items-center gap-2.5"
						>
							<span
								className={`flex size-16 items-center justify-center rounded-2xl border shadow-lg backdrop-blur-sm transition-transform group-hover:-translate-y-0.5 ${tool.className}`}
							>
								<tool.icon className="size-7" />
							</span>
							<span className="text-sm font-medium leading-tight whitespace-pre-line drop-shadow text-center">
								{tool.label}
							</span>
						</Link>
					))}
				</div>

				{/* Trust badges */}
				<div className="mt-12 flex flex-wrap items-center justify-start gap-3">
					{badges.map((badge) => (
						<span
							key={badge.label}
							className="inline-flex items-center gap-2 rounded-full border border-amber-900/15 bg-amber-50/70 px-4 py-2 text-sm font-medium text-amber-950 shadow-sm backdrop-blur-sm"
						>
							<badge.icon className="size-4 text-amber-700" />
							{badge.label}
						</span>
					))}
				</div>
			</div>
		</section>
	);
}

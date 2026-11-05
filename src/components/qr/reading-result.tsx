import { Effect, Match, Option } from "effect";
import {
	Camera,
	Check,
	CircleAlert,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	ImageOff,
	RotateCcw,
	TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useJustDone } from "#/components/done-burst.tsx";
import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { Button, buttonVariants } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { useFlash } from "#/hooks/use-flash.ts";
import { useObjectUrl } from "#/hooks/use-object-url.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import {
	type Content,
	describeContent,
	type WifiDetails,
} from "#/lib/qr/content.ts";
import type { QrReading } from "#/lib/qr/decode.ts";
import { copyText } from "#/lib/qr/render.ts";
import { cn } from "#/lib/utils.ts";

export type ResultView =
	| { readonly phase: "reading" }
	| { readonly phase: "found"; readonly reading: QrReading }
	| { readonly phase: "failed"; readonly message: string };

/** Where the thing being read came from. */
export type ResultSource =
	| { readonly kind: "camera" }
	| { readonly kind: "image"; readonly file: File }
	| { readonly kind: "other"; readonly name: string };

const FLASH_MS = 1800;

// What each phase says on the card. A lookup keeps the three phases in one place.
const PHASES: Record<
	ResultView["phase"],
	{ readonly detail: string; readonly pill: PillState; readonly label: string }
> = {
	reading: {
		detail: "Looking for a QR code…",
		pill: "working",
		label: "Reading",
	},
	found: { detail: "Read on your device", pill: "done", label: "Found" },
	failed: { detail: "Nothing was read", pill: "failed", label: "Not read" },
};

const READ_TIPS = [
	"Crop closer, so the code fills most of the picture.",
	"Make sure all three corner squares are in view.",
	"Avoid glare and shadows across the code.",
	"If it is on a screen, take a screenshot instead of a photo.",
] as const;

function IconTile({ children }: { readonly children: React.ReactNode }) {
	return (
		<div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-cat-file/20">
			{children}
		</div>
	);
}

function FileThumb({ file }: { readonly file: File }) {
	const url = useObjectUrl(file);

	return (
		<div className="size-14 shrink-0 overflow-hidden rounded-md border bg-background">
			{url && <img src={url} alt="" className="size-full object-cover" />}
		</div>
	);
}

function CopyButton({
	text,
	label,
	variant = "outline",
	size = "default",
}: {
	readonly text: string;
	readonly label: string;
	readonly variant?: "default" | "outline" | "ghost";
	readonly size?: "default" | "sm";
}) {
	const [copied, flash] = useFlash(FLASH_MS);

	async function copy() {
		const exit = await Effect.runPromiseExit(copyText(text));

		if (Option.isSome(toastOnExit(exit, "Couldn't copy the text."))) {
			flash();
			toast.success("Copied.");
		}
	}

	return (
		<Button variant={variant} size={size} onClick={copy}>
			{copied ? <Check /> : <Copy />}
			{copied ? "Copied" : label}
		</Button>
	);
}

function WifiRows({ wifi }: { readonly wifi: WifiDetails }) {
	const [shown, setShown] = useState(false);
	const rows = [
		{ label: "Network", value: wifi.ssid },
		{ label: "Security", value: wifi.security },
	];

	return (
		<dl className="divide-y rounded-md border bg-background text-sm">
			{rows.map((row) => (
				<div
					key={row.label}
					className="flex items-center justify-between gap-3 px-3 py-2.5"
				>
					<dt className="text-muted-foreground">{row.label}</dt>
					<dd className="min-w-0 font-medium break-all">{row.value}</dd>
				</div>
			))}
			{wifi.password !== "" && (
				<div className="flex items-center justify-between gap-3 px-3 py-1.5">
					<dt className="text-muted-foreground">Password</dt>
					<dd className="flex min-w-0 items-center gap-1">
						<span className="min-w-0 font-mono break-all">
							{shown
								? wifi.password
								: "•".repeat(Math.min(wifi.password.length, 12))}
						</span>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={shown ? "Hide password" : "Show password"}
							aria-pressed={shown}
							onClick={() => setShown((value) => !value)}
						>
							{shown ? <EyeOff /> : <Eye />}
						</Button>
					</dd>
				</div>
			)}
		</dl>
	);
}

function FoundBody({
	reading,
	content,
}: {
	readonly reading: QrReading;
	readonly content: Content;
}) {
	return (
		<div className="flex flex-col gap-4">
			<span className="w-fit rounded-full bg-cat-file/20 px-2.5 py-0.5 text-xs font-semibold text-foreground">
				{content.label}
			</span>

			{content.wifi ? (
				<WifiRows wifi={content.wifi} />
			) : (
				<pre className="max-h-64 overflow-auto rounded-md border bg-background p-3 font-mono text-sm break-all whitespace-pre-wrap select-all">
					{reading.text}
				</pre>
			)}

			{content.caution && (
				<output className="flex gap-2.5 rounded-md bg-warning/25 px-3 py-2.5 text-sm">
					<TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
					{content.caution}
				</output>
			)}

			<div className="flex flex-wrap gap-2">
				{content.wifi ? (
					content.wifi.password !== "" && (
						<CopyButton
							text={content.wifi.password}
							label="Copy password"
							variant="default"
						/>
					)
				) : (
					<CopyButton text={reading.text} label="Copy text" variant="default" />
				)}
				{content.href && (
					<a
						href={content.href}
						target="_blank"
						rel="noopener noreferrer"
						title={content.href}
						className={cn(
							buttonVariants({ variant: "outline" }),
							"max-w-full min-w-0",
						)}
					>
						<ExternalLink />
						<span className="truncate">Open {content.host}</span>
					</a>
				)}
			</div>
		</div>
	);
}

/**
 * The result of one read. The card keeps one shape through all three phases,
 * so the page does not jump when the decode finishes.
 */
export function ReadingResult({
	view,
	source,
	onReset,
}: {
	readonly view: ResultView;
	readonly source: ResultSource;
	readonly onReset: () => void;
}) {
	const justFound = useJustDone(view.phase === "found");
	const phase = PHASES[view.phase];
	const content =
		view.phase === "found" ? describeContent(view.reading.text) : undefined;
	const headingRef = useRef<HTMLHeadingElement>(null);
	const title = Match.value(source).pipe(
		Match.when({ kind: "image" }, (image) => image.file.name),
		Match.when({ kind: "other" }, (other) => other.name),
		Match.orElse(() => "Camera scan"),
	);

	// A new result is a new place on the page. Put focus on its title so a
	// keyboard or screen-reader user lands where the news is.
	useEffect(() => {
		headingRef.current?.focus();
	}, []);

	return (
		<section
			aria-label="Result"
			aria-busy={view.phase === "reading"}
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
		>
			<div className="flex items-center gap-3">
				{Match.value(source).pipe(
					Match.when({ kind: "image" }, (image) => (
						<FileThumb file={image.file} />
					)),
					Match.when({ kind: "other" }, () => (
						<IconTile>
							<ImageOff aria-hidden className="size-6" />
						</IconTile>
					)),
					Match.orElse(() => (
						<IconTile>
							<Camera aria-hidden className="size-6" />
						</IconTile>
					)),
				)}
				<div className="min-w-0 flex-1">
					<h2
						ref={headingRef}
						tabIndex={-1}
						className="truncate text-sm font-medium outline-none"
					>
						{title}
					</h2>
					<p className="text-xs text-muted-foreground">{phase.detail}</p>
				</div>
				<StatusPill
					state={phase.pill}
					label={phase.label}
					celebrate={justFound}
				/>
			</div>

			{/* Always mounted, so a screen reader hears each change. Failures are
			    announced by their own alert below. */}
			<output className="sr-only">
				{view.phase === "reading" && "Reading the image."}
				{content && `QR code found. ${content.label}.`}
			</output>

			{view.phase === "reading" && (
				<div aria-hidden className="flex flex-col gap-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-16 w-full" />
					<Skeleton className="h-9 w-32" />
				</div>
			)}

			{view.phase === "found" && content && (
				<FoundBody reading={view.reading} content={content} />
			)}

			{view.phase === "failed" && (
				<div role="alert" className="flex flex-col gap-3">
					<p className="flex gap-2.5 rounded-md bg-destructive/15 px-3 py-2.5 text-sm">
						<CircleAlert
							aria-hidden
							className="mt-0.5 size-4 shrink-0 text-destructive"
						/>
						{view.message}
					</p>
					<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						{READ_TIPS.map((tip) => (
							<li key={tip}>{tip}</li>
						))}
					</ul>
				</div>
			)}

			<div className={cn("flex", view.phase === "reading" && "invisible")}>
				<Button
					variant={view.phase === "failed" ? "default" : "ghost"}
					size="sm"
					onClick={onReset}
				>
					<RotateCcw />
					{view.phase === "failed" ? "Try another image" : "Read another"}
				</Button>
			</div>
		</section>
	);
}

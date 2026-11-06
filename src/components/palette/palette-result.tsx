import { Effect, Option } from "effect";
import { Check, CircleAlert, ImageOff, RotateCcw, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { ChoiceGroup } from "#/components/choice-group.tsx";
import { CopyTextButton } from "#/components/copy-text-button.tsx";
import { useJustDone } from "#/components/done-burst.tsx";
import { type PillState, StatusPill } from "#/components/status-pill.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { useFlash } from "#/hooks/use-flash.ts";
import { useObjectUrl } from "#/hooks/use-object-url.ts";
import { copyText } from "#/lib/clipboard.ts";
import {
	COLOR_FORMATS,
	type ColorFormat,
	formatColor,
	toCssVariables,
	toHex,
} from "#/lib/color/format.ts";
import type { PaletteColor } from "#/lib/color/palette.ts";
import { toastOnExit } from "#/lib/exit-toast.ts";
import { cn } from "#/lib/utils.ts";
import { m } from "#/paraglide/messages.js";

export type ExtractView =
	| { readonly phase: "reading" }
	| { readonly phase: "found"; readonly colors: ReadonlyArray<PaletteColor> }
	| { readonly phase: "failed"; readonly message: string };

const FLASH_MS = 1800;

// What each phase says on the card. A function, because the words depend on the
// active language and cannot be read at module load.
const phaseText = (
	phase: ExtractView["phase"],
): {
	readonly detail: string;
	readonly pill: PillState;
	readonly label: string;
	/** The text on the button that leaves this result. */
	readonly action: string;
} => {
	switch (phase) {
		case "reading":
			return {
				detail: m.palette_phase_reading_detail(),
				pill: "working",
				label: m.palette_phase_reading_pill(),
				action: m.palette_phase_reading_action(),
			};
		case "found":
			return {
				detail: m.palette_phase_found_detail(),
				pill: "done",
				label: m.palette_phase_found_pill(),
				action: m.palette_phase_found_action(),
			};
		case "failed":
			return {
				detail: m.palette_phase_failed_detail(),
				pill: "failed",
				label: m.palette_phase_failed_pill(),
				action: m.palette_phase_failed_action(),
			};
	}
};

export const COUNT_CHOICES = [
	{ value: "4", label: "4" },
	{ value: "6", label: "6" },
	{ value: "8", label: "8" },
	{ value: "10", label: "10" },
] as const;

const FORMAT_CHOICES = COLOR_FORMATS.map(({ value, label }) => ({
	value,
	label,
}));

function sharePercent(share: number): string {
	return share < 0.01 ? "<1%" : `${Math.round(share * 100)}%`;
}

function FileThumb({ file }: { readonly file: File }) {
	const url = useObjectUrl(file);
	// A file that is not an image (a rejected PDF, say) would show a broken picture.
	const isImage = file.type.startsWith("image/");

	return (
		<div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
			{isImage ? (
				url && <img src={url} alt="" className="size-full object-cover" />
			) : (
				<ImageOff aria-hidden className="size-6 text-muted-foreground" />
			)}
		</div>
	);
}

// The swatch colors come from the image, so they are inline styles. Everything
// around them uses theme tokens.
function Swatch({
	color,
	format,
}: {
	readonly color: PaletteColor;
	readonly format: ColorFormat;
}) {
	const [copied, flash] = useFlash(FLASH_MS);
	const value = formatColor(color.rgb, format);
	const share = sharePercent(color.share);

	async function copy() {
		const exit = await Effect.runPromiseExit(copyText(value));

		if (Option.isSome(toastOnExit(exit, m.palette_copy_color_failed())))
			flash();
	}

	return (
		<li className="animate-pop-in">
			<button
				type="button"
				onClick={copy}
				aria-label={m.palette_swatch_aria({ value, share })}
				className="flex w-full flex-col gap-2 rounded-lg p-2 text-left transition-[background-color,box-shadow,scale] duration-150 ease-out outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] motion-reduce:active:scale-100"
			>
				<span
					className="h-20 w-full rounded-md border border-input"
					style={{ backgroundColor: toHex(color.rgb) }}
				/>
				<span className="flex items-start justify-between gap-2">
					{/* The value keeps its space while "Copied" sits on top, so a long
					    value that wraps does not change the row height for 1.8 seconds. */}
					<span className="relative min-w-0 font-mono text-xs break-all">
						<span className={cn(copied && "invisible")}>{value}</span>
						{copied && (
							<span className="absolute inset-0 flex items-start gap-1 font-sans font-semibold">
								<Check aria-hidden className="size-3.5 shrink-0" />
								{m.copy_copied()}
							</span>
						)}
					</span>
					<span className="shrink-0 text-xs text-muted-foreground">
						{share}
					</span>
				</span>
			</button>
			<output className="sr-only">
				{copied ? m.palette_copied_sr({ value }) : ""}
			</output>
		</li>
	);
}

function CopyCssButton({
	colors,
	format,
}: {
	readonly colors: ReadonlyArray<PaletteColor>;
	readonly format: ColorFormat;
}) {
	return (
		<CopyTextButton
			label={m.palette_copy_css()}
			getText={() =>
				toCssVariables(
					colors.map((color) => color.rgb),
					format,
				)
			}
			copiedMessage={m.palette_copy_css_done()}
			failureMessage={m.palette_copy_css_failed()}
		/>
	);
}

/**
 * The palette of one image. The card keeps one shape through reading, found and
 * failed, so the page does not jump when the work finishes.
 */
export function PaletteResult({
	view,
	file,
	count,
	format,
	onCountChange,
	onFormatChange,
	onReset,
}: {
	readonly view: ExtractView;
	readonly file: File;
	readonly count: number;
	readonly format: ColorFormat;
	readonly onCountChange: (count: number) => void;
	readonly onFormatChange: (format: ColorFormat) => void;
	readonly onReset: () => void;
}) {
	const justFound = useJustDone(view.phase === "found");
	const phase = phaseText(view.phase);
	const headingRef = useRef<HTMLHeadingElement>(null);

	const shown = view.phase === "found" ? view.colors.slice(0, count) : [];

	// Flex grow factors that add up to less than 1 fill only that fraction of the
	// strip, and the shown shares nearly always do. Divide by their sum so the
	// strip is always full.
	const shownTotal = shown.reduce((sum, color) => sum + color.share, 0);

	// A new result is a new place on the page. Put focus on its title so a
	// keyboard or screen-reader user lands where the news is.
	useEffect(() => {
		headingRef.current?.focus();
	}, []);

	return (
		<section
			aria-label={m.palette_result_aria()}
			aria-busy={view.phase === "reading"}
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
		>
			<div className="flex items-center gap-3">
				<FileThumb file={file} />
				<div className="min-w-0 flex-1">
					<h2
						ref={headingRef}
						tabIndex={-1}
						className="truncate text-sm font-medium outline-none"
					>
						{file.name}
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
				{view.phase === "reading" && m.palette_reading_sr()}
				{view.phase === "found" &&
					(shown.length === 1
						? m.palette_found_sr_one({ count: shown.length })
						: m.palette_found_sr_other({ count: shown.length }))}
			</output>

			{view.phase === "reading" && (
				<div aria-hidden className="flex flex-col gap-3">
					<Skeleton className="h-12 w-full" />
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<Skeleton className="h-28" />
						<Skeleton className="h-28" />
						<Skeleton className="hidden h-28 sm:block" />
					</div>
				</div>
			)}

			{view.phase === "found" && (
				<>
					<div
						aria-hidden
						className="flex h-12 overflow-hidden rounded-lg border border-input"
					>
						{shown.map((color) => (
							<span
								key={toHex(color.rgb)}
								className="h-full"
								style={{
									flexGrow: color.share / shownTotal,
									backgroundColor: toHex(color.rgb),
								}}
							/>
						))}
					</div>

					<ul className="-mx-2 grid grid-cols-2 gap-1 sm:grid-cols-3">
						{shown.map((color) => (
							<Swatch key={toHex(color.rgb)} color={color} format={format} />
						))}
					</ul>

					<div className="flex flex-col gap-4">
						<ChoiceGroup
							legend={m.palette_format_legend()}
							name="palette-format"
							choices={FORMAT_CHOICES}
							value={format}
							onChange={onFormatChange}
						/>
						{/* Nothing to choose when the image has no more colors than the smallest count. */}
						{view.colors.length > Number(COUNT_CHOICES[0].value) && (
							<ChoiceGroup
								legend={m.palette_count_legend()}
								name="palette-count"
								choices={COUNT_CHOICES}
								value={String(count)}
								onChange={(value) => onCountChange(Number(value))}
							/>
						)}
					</div>
				</>
			)}

			{view.phase === "failed" && (
				<p
					role="alert"
					className="flex gap-2.5 rounded-md bg-destructive/15 px-3 py-2.5 text-sm"
				>
					<CircleAlert
						aria-hidden
						className="mt-0.5 size-4 shrink-0 text-destructive"
					/>
					{view.message}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-2">
				{view.phase === "found" && (
					<CopyCssButton colors={shown} format={format} />
				)}
				{/* While reading this stops the work, so a slow image never traps the page. */}
				<Button
					variant={view.phase === "failed" ? "default" : "ghost"}
					size={view.phase === "found" ? "default" : "sm"}
					onClick={onReset}
				>
					{view.phase === "reading" ? <X /> : <RotateCcw />}
					{phase.action}
				</Button>
			</div>
		</section>
	);
}

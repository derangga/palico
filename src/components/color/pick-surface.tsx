import { Cause, Effect, Exit, Option } from "effect";
import { CircleAlert, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PixelReadout } from "#/components/color/pixel-readout.tsx";
import { Button } from "#/components/ui/button.tsx";
import { Skeleton } from "#/components/ui/skeleton.tsx";
import { toHex } from "#/lib/color/format.ts";
import type { Rgb } from "#/lib/color/oklab.ts";
import { type PaintedImage, paintImage } from "#/lib/color/paint-image.ts";
import {
	centerPixel,
	moveCursor,
	type PixelPoint,
	pointFromPointer,
	WINDOW_SIDE,
	windowOrigin,
} from "#/lib/color/sample.ts";

type SurfaceView =
	| { readonly phase: "reading" }
	| { readonly phase: "ready"; readonly image: PaintedImage }
	| { readonly phase: "failed"; readonly message: string };

interface Probe {
	readonly point: PixelPoint;
	/** Undefined when the pixel is transparent. */
	readonly rgb: Rgb | undefined;
}

const BIG_STEP = 10;

// The text of the button that leaves this image. While reading it stops the work.
const RESET_LABELS: Record<SurfaceView["phase"], string> = {
	reading: "Cancel",
	ready: "Use another image",
	failed: "Try another image",
};

const CANVAS_HELP_ID = "pick-surface-help";

/** Only a known non-image stops here. An empty type goes to the decoder, which accepts or refuses it. */
export const isKnownNonImage = (file: File): boolean =>
	file.type !== "" && !file.type.startsWith("image/");

/**
 * One image on a canvas, ready to be picked from. A new image is a new surface
 * (the parent sets `key`), so each one loads once and cleans up after itself.
 */
export function PickSurface({
	file,
	onPick,
	onCommit,
	onReset,
}: {
	readonly file: File;
	/** The color changed while the pointer or an arrow key moved. */
	readonly onPick: (color: Rgb) => void;
	/** The person settled on a color: pointer up, Enter or Space. */
	readonly onCommit: (color: Rgb) => void;
	readonly onReset: () => void;
}) {
	const [view, setView] = useState<SurfaceView>(() =>
		isKnownNonImage(file)
			? {
					phase: "failed",
					message: `"${file.name}" isn't an image. Choose a PNG, JPG, WebP or GIF file.`,
				}
			: { phase: "reading" },
	);

	const [probe, setProbe] = useState<Probe | null>(null);
	// What a screen reader hears. Only keyboard moves set it: hovering with a
	// mouse would otherwise announce every pixel the pointer crosses.
	const [announcement, setAnnouncement] = useState("");
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const readoutRef = useRef<HTMLCanvasElement>(null);
	const headingRef = useRef<HTMLHeadingElement>(null);
	const dragging = useRef(false);

	useEffect(() => {
		headingRef.current?.focus();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;

		if (!canvas || isKnownNonImage(file)) return;

		const controller = new AbortController();

		void Effect.runPromiseExit(paintImage(file, canvas), {
			signal: controller.signal,
		}).then((exit) => {
			if (controller.signal.aborted) return;

			if (Exit.isSuccess(exit)) {
				setView({ phase: "ready", image: exit.value });

				return;
			}

			const failure = Option.getOrUndefined(Cause.findErrorOption(exit.cause));

			if (!failure) console.error(Cause.pretty(exit.cause));

			setView({
				phase: "failed",
				message:
					failure?.message ?? "Something went wrong while opening this image.",
			});
		});

		return () => {
			controller.abort();
			// A 4096 px canvas holds about 64 MB. Let go of it now, not when the
			// garbage collector gets to it.
			canvas.width = 0;
		};
	}, [file]);

	// Reads the window around a point, draws it in the readout, and notes what is
	// under the cursor. `announce` also says it to screen readers.
	function look(point: PixelPoint, announce = false): Probe | undefined {
		const image = view.phase === "ready" ? view.image : undefined;
		const readout = readoutRef.current?.getContext("2d");

		if (!image || !readout) return undefined;

		const origin = windowOrigin(point);

		const around = image.context.getImageData(
			origin.x,
			origin.y,
			WINDOW_SIDE,
			WINDOW_SIDE,
		);

		readout.putImageData(around, 0, 0);

		const middle = centerPixel(around.data);

		const next: Probe = {
			point,
			rgb: middle?.opaque ? middle.rgb : undefined,
		};

		// Many pointer moves land in the same pixel. Keep the old state then, so
		// they do not re-render the page.
		setProbe((previous) =>
			previous?.point.x === point.x && previous.point.y === point.y
				? previous
				: next,
		);

		if (announce) {
			setAnnouncement(
				`x ${point.x}, y ${point.y}, ${next.rgb ? toHex(next.rgb) : "transparent"}`,
			);
		}

		return next;
	}

	function pickAt(point: PixelPoint, announce = false) {
		const found = look(point, announce);

		if (found?.rgb) onPick(found.rgb);
	}

	function pointOf(event: { clientX: number; clientY: number }): PixelPoint {
		const canvas = canvasRef.current;

		if (!canvas || view.phase !== "ready") return { x: 0, y: 0 };

		return pointFromPointer(
			{ x: event.clientX, y: event.clientY },
			canvas.getBoundingClientRect(),
			view.image,
		);
	}

	const image = view.phase === "ready" ? view.image : undefined;

	// The width the canvas is drawn at: the image's own size at most, the room
	// there is, and no taller than 60% of the screen. The frame gets this width
	// outright, so the canvas and the cursor marker are always the same box.
	const frameWidth = image
		? `min(100%, ${image.width + 2}px, calc(${((60 * image.width) / image.height).toFixed(3)}vh + 2px))`
		: undefined;

	return (
		<section
			aria-label="Image to pick from"
			aria-busy={view.phase === "reading"}
			className="animate-pop-in flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6"
		>
			<div className="min-w-0">
				<h2
					ref={headingRef}
					tabIndex={-1}
					className="truncate text-sm font-medium outline-none"
				>
					{file.name}
				</h2>
				<p className="text-xs text-muted-foreground">
					{view.phase === "reading" && "Opening the image…"}
					{view.phase === "ready" &&
						`${view.image.width} × ${view.image.height} px${view.image.shrunk ? ", shrunk to fit" : ""}`}
					{view.phase === "failed" && "Nothing was opened"}
				</p>
			</div>

			{view.phase === "reading" && (
				<Skeleton aria-hidden className="h-56 w-full" />
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

			{/* Always mounted, because the loader draws into it. Hidden until it has an image. */}
			<div className={image ? "flex flex-col gap-4 sm:flex-row" : "hidden"}>
				<div
					className="relative min-w-0 self-start overflow-hidden rounded-md border border-input"
					style={{ width: frameWidth }}
				>
					<canvas
						ref={canvasRef}
						tabIndex={0}
						aria-label="Image. Click or press the arrow keys to pick a color."
						aria-describedby={CANVAS_HELP_ID}
						className="block h-auto w-full cursor-crosshair outline-none select-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
						onFocus={() => {
							// Focus starts the cursor in the middle, and only looks. Moving a
							// color on focus alone would surprise a keyboard user. A click
							// focuses too, but it has already chosen its own pixel.
							if (image && !probe && !dragging.current) {
								look(
									{
										x: Math.floor(image.width / 2),
										y: Math.floor(image.height / 2),
									},
									true,
								);
							}
						}}
						onPointerDown={(event) => {
							// Only the main button. A right click opens a menu, and its
							// release may never reach the page.
							if (event.button !== 0 || !event.isPrimary) return;

							dragging.current = true;
							event.currentTarget.setPointerCapture(event.pointerId);

							// A finger may be starting a scroll, so a touch waits for its
							// release to pick. A mouse or pen picks at once.
							if (event.pointerType !== "touch") pickAt(pointOf(event));
						}}
						onPointerMove={(event) => {
							const point = pointOf(event);

							// No button down means the press ended somewhere we did not see.
							if (event.buttons === 0) dragging.current = false;

							if (dragging.current && event.pointerType !== "touch") {
								pickAt(point);
							} else {
								look(point);
							}
						}}
						onPointerUp={(event) => {
							// A release that began elsewhere, or after a cancel, is not a pick.
							if (!dragging.current) return;

							dragging.current = false;

							const found = look(pointOf(event));

							if (found?.rgb) onCommit(found.rgb);
						}}
						onPointerCancel={() => {
							dragging.current = false;
						}}
						onKeyDown={(event) => {
							if (!image || !probe) return;

							// Alt+Arrow is Back, and Ctrl or Cmd with arrows belongs to the browser.
							if (event.altKey || event.ctrlKey || event.metaKey) return;

							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();

								if (probe.rgb) {
									onCommit(probe.rgb);
									setAnnouncement(`Kept ${toHex(probe.rgb)}`);
								}

								return;
							}

							const next = moveCursor(
								probe.point,
								event.key,
								event.shiftKey ? BIG_STEP : 1,
								image,
							);

							if (!next) return;

							event.preventDefault();
							pickAt(next, true);
						}}
					/>
					{image && probe && (
						// The ring is dark and light at once, so it shows on any image.
						<span
							aria-hidden
							className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ring-2 ring-foreground"
							style={{
								left: `${((probe.point.x + 0.5) / image.width) * 100}%`,
								top: `${((probe.point.y + 0.5) / image.height) * 100}%`,
							}}
						/>
					)}
				</div>

				<div className="flex flex-row items-start gap-3 sm:flex-col">
					<PixelReadout canvasRef={readoutRef} />
					<p className="text-xs text-muted-foreground">
						{probe
							? `x ${probe.point.x}, y ${probe.point.y}`
							: "Hover the image"}
						<br />
						{probe &&
							(probe.rgb ? (
								<span className="font-mono">{toHex(probe.rgb)}</span>
							) : (
								"Transparent here"
							))}
					</p>
				</div>
			</div>

			{image && (
				<p id={CANVAS_HELP_ID} className="text-xs text-muted-foreground">
					Click or drag to pick. With the keyboard, Tab to the image, use the
					arrow keys (Shift for 10 pixels) and press Enter to keep the color.
				</p>
			)}

			{/* The pixel under the cursor after a keyboard move, for screen readers. */}
			<output className="sr-only">{announcement}</output>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant={view.phase === "failed" ? "default" : "ghost"}
					size={view.phase === "failed" ? "default" : "sm"}
					onClick={onReset}
				>
					{view.phase === "reading" ? <X /> : <RotateCcw />}
					{RESET_LABELS[view.phase]}
				</Button>
			</div>
		</section>
	);
}

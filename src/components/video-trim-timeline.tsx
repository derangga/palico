// Trim selection bar — the "Video trim selection" control from the wireframe,
// styled as a filmstrip (frames behind the track, the kept range bracketed by
// draggable handles, a playhead with a time pill). Layout follows the reference
// design but uses palico's warm tokens, not the reference's navy/cyan.
//
// Pure presentational + DOM interaction: no ffmpeg, no Effect. The parent owns
// the numbers (duration/start/end/current) and the <video> element; this
// component only reports intent via callbacks.

import { useCallback, useId, useRef } from "react";

import { cn } from "#/lib/utils.ts";

interface VideoTrimTimelineProps {
	/** Total source duration in seconds. */
	readonly duration: number;
	/** Selection start in seconds. */
	readonly start: number;
	/** Selection end in seconds. */
	readonly end: number;
	/** Playhead position in seconds. */
	readonly currentTime: number;
	/** Evenly-spaced filmstrip frames (data URLs). Empty → plain track. */
	readonly thumbnails?: ReadonlyArray<string>;
	/** Smallest allowed selection length. Defaults to 0.5s. */
	readonly minSelection?: number;
	/** Largest allowed selection length. Defaults to no limit. */
	readonly maxSelection?: number;
	/** Keyboard nudge step in seconds. Defaults to 1s. */
	readonly step?: number;
	readonly disabled?: boolean;
	readonly onChangeStart: (sec: number) => void;
	readonly onChangeEnd: (sec: number) => void;
	readonly onScrub: (sec: number) => void;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const pct = (value: number, duration: number) =>
	duration > 0 ? clamp((value / duration) * 100, 0, 100) : 0;

// Stable empty default so an omitted `thumbnails` prop doesn't allocate a fresh
// array each render (which would defeat downstream memoization).
const EMPTY_THUMBNAILS: ReadonlyArray<string> = [];

// Static handle grip — no props/state, so build it once at module scope.
const GRIP = (
	<span className="flex flex-col gap-0.5">
		<span className="h-3 w-px rounded-full bg-primary-foreground/70" />
		<span className="h-3 w-px rounded-full bg-primary-foreground/70" />
	</span>
);

// mm:ss.d — matches the reference's tenth-of-a-second precision.
const fmt = (totalSeconds: number) => {
	const s = Math.max(0, totalSeconds);
	const mins = Math.floor(s / 60);
	const secs = Math.floor(s % 60);
	const tenths = Math.floor((s * 10) % 10);

	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
};

export function VideoTrimTimeline({
	duration,
	start,
	end,
	currentTime,
	thumbnails = EMPTY_THUMBNAILS,
	minSelection = 0.5,
	maxSelection = Number.POSITIVE_INFINITY,
	step = 1,
	disabled = false,
	onChangeStart,
	onChangeEnd,
	onScrub,
}: VideoTrimTimelineProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const startHandleId = useId();
	const endHandleId = useId();

	// Map a pointer x-coordinate to a second on the source timeline.
	const secAt = useCallback(
		(clientX: number) => {
			const el = trackRef.current;

			if (!el || duration <= 0) return 0;
			const rect = el.getBoundingClientRect();

			if (rect.width <= 0) return 0;
			const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);

			return ratio * duration;
		},
		[duration],
	);

	const beginDrag = useCallback(
		(e: React.PointerEvent, move: (sec: number) => void) => {
			if (disabled) return;
			e.preventDefault();
			e.stopPropagation();
			e.currentTarget.setPointerCapture(e.pointerId);
			move(secAt(e.clientX));
		},
		[disabled, secAt],
	);

	// Allowed handle ranges: the selection stays between minSelection and
	// maxSelection long, inside the source.
	const startMin = Math.max(0, end - maxSelection);
	const startMax = end - minSelection;
	const endMin = start + minSelection;
	const endMax = Math.min(duration, start + maxSelection);

	const onStartHandleDown = useCallback(
		(e: React.PointerEvent) =>
			beginDrag(e, (sec) => onChangeStart(clamp(sec, startMin, startMax))),
		[beginDrag, onChangeStart, startMin, startMax],
	);

	const onStartHandleMove = useCallback(
		(e: React.PointerEvent) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			onChangeStart(clamp(secAt(e.clientX), startMin, startMax));
		},
		[secAt, onChangeStart, startMin, startMax],
	);

	const onEndHandleDown = useCallback(
		(e: React.PointerEvent) =>
			beginDrag(e, (sec) => onChangeEnd(clamp(sec, endMin, endMax))),
		[beginDrag, onChangeEnd, endMin, endMax],
	);

	const onEndHandleMove = useCallback(
		(e: React.PointerEvent) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			onChangeEnd(clamp(secAt(e.clientX), endMin, endMax));
		},
		[secAt, onChangeEnd, endMin, endMax],
	);

	// Click/drag on the track body (not a handle) scrubs the playhead.
	const onTrackDown = useCallback(
		(e: React.PointerEvent) => beginDrag(e, (sec) => onScrub(sec)),
		[beginDrag, onScrub],
	);

	const onTrackMove = useCallback(
		(e: React.PointerEvent) => {
			if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
			onScrub(secAt(e.clientX));
		},
		[secAt, onScrub],
	);

	// Arrow keys nudge a handle; Home/End jump to its allowed extreme.
	const handleKey = useCallback(
		(
			e: React.KeyboardEvent,
			current: number,
			min: number,
			max: number,
			commit: (sec: number) => void,
		) => {
			let next: number | null = null;

			switch (e.key) {
				case "ArrowLeft":
				case "ArrowDown":
					next = current - step;
					break;
				case "ArrowRight":
				case "ArrowUp":
					next = current + step;
					break;
				case "Home":
					next = min;
					break;
				case "End":
					next = max;
					break;
				default:
					return;
			}

			e.preventDefault();
			commit(clamp(next, min, max));
		},
		[step],
	);

	const startPct = pct(start, duration);
	const endPct = pct(end, duration);
	const headPct = pct(currentTime, duration);

	return (
		<div className={cn("select-none pt-6", disabled && "opacity-50")}>
			<div
				ref={trackRef}
				onPointerDown={onTrackDown}
				onPointerMove={onTrackMove}
				className={cn(
					"relative h-16 w-full touch-none",
					disabled && "pointer-events-none",
				)}
			>
				{/* Filmstrip frames (clipped to the track). */}
				<div className="absolute inset-0 flex overflow-hidden rounded-lg border bg-muted">
					{thumbnails.length > 0
						? thumbnails.map((src, i) => (
								<img
									// oxlint-disable-next-line react/no-array-index-key -- frames are positional and never reordered.
									key={i}
									src={src}
									alt=""
									draggable={false}
									className="h-full min-w-0 flex-1 object-cover"
								/>
							))
						: null}
				</div>

				{/* Dim the regions outside the selection. */}
				<div
					className="absolute inset-y-0 left-0 rounded-l-lg bg-background/65"
					style={{ width: `${startPct}%` }}
				/>
				<div
					className="absolute inset-y-0 right-0 rounded-r-lg bg-background/65"
					style={{ width: `${100 - endPct}%` }}
				/>

				{/* Kept-range frame. */}
				<div
					className="pointer-events-none absolute inset-y-0 border-primary border-y-2"
					style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
				/>

				{/* Playhead line. No left-transition: the parent updates currentTime
				    every animation frame during playback, so the per-frame position
				    changes ARE the motion — a CSS transition would restart every frame
				    and never complete, making the line appear stuck until playback stops. */}
				<div
					className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-foreground"
					style={{ left: `${headPct}%` }}
				/>

				{/* Playhead time pill (sits above the track). Grabbing it drags the
				    playhead: pointerdown bubbles to the track's scrub handlers. */}
				<div
					className="absolute top-0 z-20 -translate-x-1/2 -translate-y-[calc(100%+4px)] cursor-grab touch-none whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 font-mono text-[10px] text-background tabular-nums shadow-sm"
					style={{ left: `${headPct}%` }}
				>
					{fmt(currentTime)}
				</div>

				{/* Start handle. Custom dual-thumb range widget: a native
				    <input type="range"> can't share one track between two thumbs
				    with a drag-selected fill, filmstrip, and playhead. Full ARIA
				    (valuemin/max/now/text + label + keyboard) is provided below. */}
				{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role */}
				<div
					id={startHandleId}
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- dual-thumb range, see the note above.
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label="Trim start"
					aria-valuemin={0}
					aria-valuemax={duration}
					aria-valuenow={start}
					aria-valuetext={fmt(start)}
					onPointerDown={onStartHandleDown}
					onPointerMove={onStartHandleMove}
					onKeyDown={(e) =>
						handleKey(e, start, startMin, startMax, onChangeStart)
					}
					className="absolute -inset-y-1 z-30 flex w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-md border border-primary bg-primary shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
					style={{ left: `${startPct}%` }}
				>
					{GRIP}
				</div>

				{/* End handle. Custom dual-thumb range widget — see the Start
				    handle note; native <input type="range"> can't express this. */}
				{/* react-doctor-disable-next-line react-doctor/prefer-tag-over-role */}
				<div
					id={endHandleId}
					// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- dual-thumb range, see the note above.
					role="slider"
					tabIndex={disabled ? -1 : 0}
					aria-label="Trim end"
					aria-valuemin={0}
					aria-valuemax={duration}
					aria-valuenow={end}
					aria-valuetext={fmt(end)}
					onPointerDown={onEndHandleDown}
					onPointerMove={onEndHandleMove}
					onKeyDown={(e) => handleKey(e, end, endMin, endMax, onChangeEnd)}
					className="absolute -inset-y-1 z-30 flex w-3 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center rounded-md border border-primary bg-primary shadow-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
					style={{ left: `${endPct}%` }}
				>
					{GRIP}
				</div>
			</div>

			{/* Timeline extents. */}
			<div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
				<span>{fmt(0)}</span>
				<span>{fmt(duration)}</span>
			</div>
		</div>
	);
}

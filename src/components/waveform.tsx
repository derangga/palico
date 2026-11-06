// The waveform behind the audio cutter's trim handles: one SVG path of mirrored
// bars. It draws in currentColor, so a Latte/Mocha swap needs no redraw. The
// trim timeline's dimming overlays wash out the bars outside the selection, so a
// drag never re-renders this component. The path is rebuilt only when the track
// width changes.

import { useEffect, useMemo, useRef, useState } from "react";

import type { WaveformState } from "#/hooks/use-waveform.ts";
import { BAR_PITCH, peaksToPath } from "#/lib/video/waveform.ts";

// Matches the h-24 track the audio stage gives the timeline.
const HEIGHT = 96;

// Stands in for the peaks while decoding or when there is no waveform: a dotted
// centerline.
const FLAT: ReadonlyArray<number> = [0];

export function Waveform({ state }: { state: WaveformState }) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(0);

	useEffect(() => {
		const el = ref.current;

		if (!el) return;

		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});

		observer.observe(el);

		return () => observer.disconnect();
	}, []);

	const bars = Math.floor(width / BAR_PITCH);
	const ready = state.status === "ready";
	const peaks = state.status === "ready" ? state.peaks : FLAT;
	const d = useMemo(() => peaksToPath(peaks, bars, HEIGHT), [peaks, bars]);

	return (
		<div
			ref={ref}
			aria-busy={state.status === "decoding"}
			className="h-full w-full"
		>
			{bars > 0 && (
				<svg
					aria-hidden="true"
					viewBox={`0 0 ${bars * BAR_PITCH} ${HEIGHT}`}
					preserveAspectRatio="none"
					className="size-full"
				>
					{/* Opacity is the only motion: 200 ms once, when the peaks arrive. */}
					<path
						d={d}
						data-ready={ready}
						fill="none"
						stroke="currentColor"
						strokeWidth={2}
						strokeLinecap="round"
						vectorEffect="non-scaling-stroke"
						className="text-primary opacity-40 transition-opacity duration-200 ease-(--ease-out) data-[ready=true]:opacity-100"
					/>
				</svg>
			)}
		</div>
	);
}

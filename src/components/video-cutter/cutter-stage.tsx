// biome-ignore-all lint/a11y/useMediaCaption: the only <video> is a user-supplied local clip with no caption track available.
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "#/components/ui/button.tsx";
import { formatTime } from "#/components/video-cutter/utils.ts";
import { VideoTrimTimeline } from "#/components/video-trim-timeline.tsx";

interface CutterStageProps {
	videoRef: RefObject<HTMLVideoElement | null>;
	objectUrl: string | null;
	currentTime: number;
	duration: number;
	isPlaying: boolean;
	start: number;
	end: number;
	thumbnails: string[];
	trimming: boolean;
	onLoadedMetadata: () => void;
	onPlay: () => void;
	onPause: () => void;
	onSeekBack: () => void;
	onSeekForward: () => void;
	onTogglePlay: () => void;
	onChangeStart: (sec: number) => void;
	onChangeEnd: (sec: number) => void;
	onScrub: (sec: number) => void;
}

export function CutterStage({
	videoRef,
	objectUrl,
	currentTime,
	duration,
	isPlaying,
	start,
	end,
	thumbnails,
	trimming,
	onLoadedMetadata,
	onPlay,
	onPause,
	onSeekBack,
	onSeekForward,
	onTogglePlay,
	onChangeStart,
	onChangeEnd,
	onScrub,
}: CutterStageProps) {
	return (
		<div className="flex min-w-0 flex-col gap-2">
			{/* User-supplied local video; no captions available. Biome's
			    useMediaCaption is suppressed file-wide at the top of the file. */}
			{/* react-doctor-disable-next-line react-doctor/media-has-caption */}
			<video
				ref={videoRef}
				src={objectUrl ?? undefined}
				aria-label="Video preview"
				onLoadedMetadata={onLoadedMetadata}
				onPlay={onPlay}
				onPause={onPause}
				className="max-h-[60vh] w-full rounded-xl border bg-black"
			/>

			{/* Playback controls: time readout above a centered button row. */}
			<div className="flex flex-col items-center gap-2">
				<span className="font-mono text-xs text-muted-foreground tabular-nums">
					{formatTime(currentTime)} / {formatTime(duration)}
				</span>
				<div className="flex items-center justify-center gap-2">
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Back 5 seconds"
						onClick={onSeekBack}
					>
						<SkipBack />
					</Button>
					<Button
						size="icon-sm"
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={onTogglePlay}
					>
						{isPlaying ? <Pause /> : <Play />}
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Forward 5 seconds"
						onClick={onSeekForward}
					>
						<SkipForward />
					</Button>
				</div>
			</div>

			{/* Trim selection */}
			<VideoTrimTimeline
				duration={duration}
				start={start}
				end={end}
				currentTime={currentTime}
				thumbnails={thumbnails}
				disabled={trimming}
				onChangeStart={onChangeStart}
				onChangeEnd={onChangeEnd}
				onScrub={onScrub}
			/>

			<p className="text-xs text-muted-foreground">
				Cuts snap to the nearest keyframe, so the clip may start up to a second
				or two before your selection.
			</p>
		</div>
	);
}

/* oxlint-disable jsx-a11y/media-has-caption -- the only <video> is a user-supplied local clip with no caption track available. */
// Preview, playback controls and selection timeline for one video. Shared by
// /video-cutter and /video-to-gif; the state lives in useClipPlayer.
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { formatTime } from "#/components/video-cutter/utils.ts";
import { VideoTrimTimeline } from "#/components/video-trim-timeline.tsx";
import type { ClipPlayer } from "#/hooks/use-clip-player.ts";

const SKIP_SECONDS = 5;

interface VideoClipStageProps {
	player: ClipPlayer;
	// True while a job runs: the timeline handles lock.
	disabled: boolean;
	// Longest selection the tool accepts, in seconds.
	maxSelection?: number;
	// Short line under the timeline, such as the cutter's keyframe note.
	note?: ReactNode;
}

export function VideoClipStage({
	player,
	disabled,
	maxSelection,
	note,
}: VideoClipStageProps) {
	const {
		videoRef,
		objectUrl,
		currentTime,
		duration,
		isPlaying,
		start,
		end,
		thumbnails,
	} = player;

	return (
		<div className="flex min-w-0 flex-col gap-2">
			{/* User-supplied local video; no captions available. oxlint's
			    media-has-caption is disabled file-wide at the top of the file. */}
			{/* react-doctor-disable-next-line react-doctor/media-has-caption */}
			<video
				ref={videoRef}
				src={objectUrl ?? undefined}
				aria-label="Video preview"
				onLoadedMetadata={player.onLoadedMetadata}
				onPlay={() => player.setPlaying(true)}
				onPause={() => player.setPlaying(false)}
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
						aria-label="Restart from selection start"
						onClick={player.restart}
					>
						<RotateCcw />
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Back 5 seconds"
						onClick={() => player.seekTo(currentTime - SKIP_SECONDS)}
					>
						<SkipBack />
					</Button>
					<Button
						size="icon-sm"
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={player.togglePlay}
					>
						{isPlaying ? <Pause /> : <Play />}
					</Button>
					<Button
						variant="outline"
						size="icon-sm"
						aria-label="Forward 5 seconds"
						onClick={() => player.seekTo(currentTime + SKIP_SECONDS)}
					>
						<SkipForward />
					</Button>
				</div>
			</div>

			<VideoTrimTimeline
				duration={duration}
				start={start}
				end={end}
				currentTime={currentTime}
				thumbnails={thumbnails}
				maxSelection={maxSelection}
				disabled={disabled}
				onChangeStart={player.changeStart}
				onChangeEnd={player.changeEnd}
				onScrub={player.seekTo}
			/>

			{note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
		</div>
	);
}

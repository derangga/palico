/* oxlint-disable jsx-a11y/media-has-caption -- the only <video> is a user-supplied local clip with no caption track available. */
// Preview, playback controls and selection timeline for one video. Shared by
// /video-cutter and /video-to-gif; the state lives in useClipPlayer.
import type { ReactNode } from "react";

import { ClipControls } from "#/components/clip-controls.tsx";
import { TrimTimeline } from "#/components/trim-timeline.tsx";
import type { ClipPlayer } from "#/hooks/use-clip-player.ts";
import { m } from "#/paraglide/messages.js";

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
	const { mediaRef, objectUrl, currentTime, duration, start, end, thumbnails } =
		player;

	return (
		<div className="flex min-w-0 flex-col gap-2">
			{/* User-supplied local video; no captions available. oxlint's
			    media-has-caption is disabled file-wide at the top of the file. */}
			{/* react-doctor-disable-next-line react-doctor/media-has-caption */}
			<video
				ref={mediaRef}
				src={objectUrl ?? undefined}
				aria-label={m.clip_video_preview()}
				onLoadedMetadata={player.onLoadedMetadata}
				onPlay={() => player.setPlaying(true)}
				onPause={() => player.setPlaying(false)}
				className="max-h-[60vh] w-full rounded-xl border bg-black"
			/>

			<ClipControls player={player} />

			<TrimTimeline
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

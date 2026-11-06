// Time readout and playback buttons for the clip stages (video and audio).
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

import { Button } from "#/components/ui/button.tsx";
import { formatTime } from "#/components/video-cutter/utils.ts";
import type { ClipPlayer } from "#/hooks/use-clip-player.ts";
import { m } from "#/paraglide/messages.js";

const SKIP_SECONDS = 5;

export function ClipControls({
	player,
}: {
	player: ClipPlayer<HTMLMediaElement>;
}) {
	const { currentTime, duration, isPlaying } = player;

	return (
		<div className="flex flex-col items-center gap-2">
			<span className="font-mono text-xs text-muted-foreground tabular-nums">
				{formatTime(currentTime)} / {formatTime(duration)}
			</span>
			<div className="flex items-center justify-center gap-2">
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={m.clip_restart()}
					onClick={player.restart}
				>
					<RotateCcw />
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={m.clip_back_5()}
					onClick={() => player.seekTo(currentTime - SKIP_SECONDS)}
				>
					<SkipBack />
				</Button>
				<Button
					size="icon-sm"
					aria-label={isPlaying ? m.clip_pause() : m.clip_play()}
					onClick={player.togglePlay}
				>
					{isPlaying ? <Pause /> : <Play />}
				</Button>
				<Button
					variant="outline"
					size="icon-sm"
					aria-label={m.clip_forward_5()}
					onClick={() => player.seekTo(currentTime + SKIP_SECONDS)}
				>
					<SkipForward />
				</Button>
			</div>
		</div>
	);
}

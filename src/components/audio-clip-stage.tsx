/* oxlint-disable jsx-a11y/media-has-caption -- the only <audio> is a user-supplied local file with no caption track available. */
// Preview, playback controls and waveform timeline for one audio file, used by
// /audio-cutter. The state lives in useClipPlayer.
import { ClipControls } from "#/components/clip-controls.tsx";
import { TrimTimeline } from "#/components/trim-timeline.tsx";
import { Waveform } from "#/components/waveform.tsx";
import type { ClipPlayer } from "#/hooks/use-clip-player.ts";
import { useWaveform } from "#/hooks/use-waveform.ts";
import { m } from "#/paraglide/messages.js";

// A function, not a constant: a constant would keep the language it was built in.
const notes = () =>
	({
		decoding: m.audiocut_decoding(),
		unavailable: m.audiocut_no_waveform(),
		ready: m.audiocut_ready_note(),
	}) as const;

interface AudioClipStageProps {
	player: ClipPlayer<HTMLAudioElement>;
	// True while a job runs: the timeline handles lock.
	disabled: boolean;
	// The browser cannot play this file, so there is no duration to build a
	// timeline from.
	onUnplayable: () => void;
}

export function AudioClipStage({
	player,
	disabled,
	onUnplayable,
}: AudioClipStageProps) {
	const { mediaRef, objectUrl, currentTime, duration, start, end, file } =
		player;

	const waveform = useWaveform(file, duration);

	return (
		<div className="flex min-w-0 flex-col gap-2">
			{/* User-supplied local audio; no captions available. */}
			{/* react-doctor-disable-next-line react-doctor/media-has-caption */}
			<audio
				ref={mediaRef}
				src={objectUrl ?? undefined}
				aria-label={m.audiocut_preview()}
				onLoadedMetadata={(e) => {
					player.onLoadedMetadata();

					// Streamed or recorded audio can report an infinite or zero
					// duration, which leaves no timeline to build.
					const d = e.currentTarget.duration;

					if (!Number.isFinite(d) || d <= 0) onUnplayable();
				}}
				onError={onUnplayable}
				onPlay={() => player.setPlaying(true)}
				onPause={() => player.setPlaying(false)}
			/>

			<ClipControls player={player} />

			<TrimTimeline
				duration={duration}
				start={start}
				end={end}
				currentTime={currentTime}
				backdrop={<Waveform state={waveform} />}
				trackClassName="h-24"
				step={0.1}
				disabled={disabled}
				onChangeStart={player.changeStart}
				onChangeEnd={player.changeEnd}
				onScrub={player.seekTo}
			/>

			<output className="text-xs text-muted-foreground">
				{notes()[waveform.status]}
			</output>
		</div>
	);
}

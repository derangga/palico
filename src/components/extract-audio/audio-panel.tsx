import { Result } from "effect";
import { AudioLines, Ban, Download, Film, Loader2 } from "lucide-react";
import { useId } from "react";

import type { AudioResult } from "#/components/extract-audio/state.ts";
import { SendTo } from "#/components/handoff/send-to.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select.tsx";
import { downloadBlob, formatBytes } from "#/components/video-cutter/utils.ts";
import {
	AUDIO_FORMATS,
	type AudioFormat,
	parseAudioFormat,
} from "#/lib/video/audio.ts";
import { m } from "#/paraglide/messages.js";

interface AudioPanelProps {
	file: File;
	format: AudioFormat;
	extracting: boolean;
	cancelling: boolean;
	percent: number;
	output: AudioResult | null;
	onChangeFormat: (format: AudioFormat) => void;
	onCancel: () => void;
	onReset: () => void;
	onExtract: () => void;
}

export function AudioPanel({
	file,
	format,
	extracting,
	cancelling,
	percent,
	output,
	onChangeFormat,
	onCancel,
	onReset,
	onExtract,
}: AudioPanelProps) {
	const formatLabelId = useId();

	let extractLabel = m.extract_extract();

	if (extracting)
		extractLabel =
			percent > 0
				? m.extract_extracting_percent({ percent })
				: m.extract_extracting();

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
				<div className="flex items-center gap-3">
					<Film className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<p className="truncate text-sm font-medium">{file.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatBytes(file.size)}
						</p>
					</div>
				</div>

				<div className="flex flex-wrap items-end gap-4">
					<div className="flex flex-col gap-1.5">
						<span
							id={formatLabelId}
							className="text-xs font-medium text-muted-foreground"
						>
							{m.extract_save_as()}
						</span>
						<Select
							items={AUDIO_FORMATS}
							value={format}
							onValueChange={(value) => {
								const parsed = parseAudioFormat(value);

								if (Result.isSuccess(parsed)) onChangeFormat(parsed.success);
							}}
							disabled={extracting}
						>
							<SelectTrigger className="w-36" aria-labelledby={formatLabelId}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{AUDIO_FORMATS.map((f) => (
									<SelectItem key={f.value} value={f.value}>
										{f.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="ml-auto flex gap-2">
						{extracting ? (
							<Button
								variant="outline"
								onClick={onCancel}
								disabled={cancelling}
								className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
								{cancelling ? m.common_cancelling() : m.common_cancel()}
							</Button>
						) : (
							<Button variant="ghost" onClick={onReset}>
								{m.common_choose_another()}
							</Button>
						)}
						<Button onClick={onExtract} disabled={extracting}>
							{extracting ? (
								<Loader2 className="animate-spin" />
							) : (
								<AudioLines />
							)}
							<span className="tabular-nums">{extractLabel}</span>
						</Button>
					</div>
				</div>
			</div>

			{output && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-card px-3 py-2.5">
					<AudioLines className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-32 flex-1">
						<p className="truncate text-sm font-medium">{output.name}</p>
						<p className="text-xs text-muted-foreground">
							{formatBytes(output.size)}
						</p>
					</div>
					<div className="ml-auto flex gap-2">
						<SendTo from="extract_audio" outputs={[output]} />
						<Button onClick={() => downloadBlob(output.blob, output.name)}>
							<Download />
							{m.common_save()}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

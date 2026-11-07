import { Ban, Download, ImagePlay, Loader2 } from "lucide-react";
import { useId } from "react";

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
import type { GifResult } from "#/components/video-gif/state.ts";
import { useObjectUrl } from "#/hooks/use-object-url.ts";
import { formatDecimal } from "#/lib/format-bytes.ts";
import {
	GIF_FPS_OPTIONS,
	GIF_SIZE_OPTIONS,
	type GifFps,
	type GifSize,
} from "#/lib/video/gif-options.ts";
import { m } from "#/paraglide/messages.js";

// Labels for <SelectValue>; without `items` it shows the raw value.
// Functions, not constants: the size labels are translated.
const fpsItems = () =>
	GIF_FPS_OPTIONS.map((f) => ({
		value: String(f),
		label: `${f} fps`,
	}));

const sizeItems = () =>
	GIF_SIZE_OPTIONS.map((s) => ({
		value: String(s.value),
		label: `${s.label} (${s.value}px)`,
	}));

interface GifPanelProps {
	fps: GifFps;
	size: GifSize;
	dimensions: { readonly width: number; readonly height: number } | null;
	clipSeconds: number;
	making: boolean;
	cancelling: boolean;
	canMake: boolean;
	output: GifResult | null;
	onChangeFps: (fps: GifFps) => void;
	onChangeSize: (size: GifSize) => void;
	onCancel: () => void;
	onReset: () => void;
	onMake: () => void;
}

export function GifPanel({
	fps,
	size,
	dimensions,
	clipSeconds,
	making,
	cancelling,
	canMake,
	output,
	onChangeFps,
	onChangeSize,
	onCancel,
	onReset,
	onMake,
}: GifPanelProps) {
	const fpsLabelId = useId();
	const sizeLabelId = useId();

	return (
		<div className="flex flex-col gap-4 min-[769px]:sticky min-[769px]:top-20">
			<div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
				<div className="flex items-center justify-between gap-4">
					<span id={fpsLabelId} className="text-xs text-muted-foreground">
						{m.videogif_fps()}
					</span>
					<Select
						items={fpsItems()}
						value={String(fps)}
						onValueChange={(value) => {
							const next = GIF_FPS_OPTIONS.find((f) => String(f) === value);

							if (next) onChangeFps(next);
						}}
						disabled={making}
					>
						<SelectTrigger className="w-40" aria-labelledby={fpsLabelId}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{fpsItems().map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span id={sizeLabelId} className="text-xs text-muted-foreground">
						{m.videogif_size()}
					</span>
					<Select
						items={sizeItems()}
						value={String(size)}
						onValueChange={(value) => {
							const next = GIF_SIZE_OPTIONS.find(
								(s) => String(s.value) === value,
							);

							if (next) onChangeSize(next.value);
						}}
						disabled={making}
					>
						<SelectTrigger className="w-40" aria-labelledby={sizeLabelId}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{sizeItems().map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">
						{m.videogif_output_size()}
					</span>
					<span className="text-sm font-medium tabular-nums">
						{dimensions ? `${dimensions.width} × ${dimensions.height}` : "—"}
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">
						{m.videogif_clip_length()}
					</span>
					<span className="text-sm font-medium tabular-nums">
						{formatDecimal(clipSeconds, 1)} s
					</span>
				</div>

				{making ? (
					<Button
						variant="outline"
						className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
						onClick={onCancel}
						disabled={cancelling}
					>
						{cancelling ? <Loader2 className="animate-spin" /> : <Ban />}
						{cancelling ? m.common_cancelling() : m.common_cancel()}
					</Button>
				) : (
					<Button variant="ghost" className="w-full" onClick={onReset}>
						{m.common_choose_another()}
					</Button>
				)}

				<Button className="w-full" onClick={onMake} disabled={!canMake}>
					{making ? <Loader2 className="animate-spin" /> : <ImagePlay />}
					{making ? m.videogif_making() : m.videogif_make()}
				</Button>
			</div>

			{output && <GifResultCard output={output} />}
		</div>
	);
}

function GifResultCard({ output }: { output: GifResult }) {
	const url = useObjectUrl(output.blob);

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-card p-3">
			{url ? (
				<img
					src={url}
					alt={m.videogif_preview_alt({ name: output.name })}
					className="max-h-64 w-full rounded-md object-contain"
				/>
			) : null}
			<div className="flex flex-wrap items-center gap-3">
				<div className="min-w-32 flex-1">
					<p className="truncate text-sm font-medium">{output.name}</p>
					<p className="text-xs text-muted-foreground">
						{formatBytes(output.size)}
					</p>
				</div>
				<div className="ml-auto flex gap-2">
					<SendTo from="video_to_gif" outputs={[output]} />
					<Button onClick={() => downloadBlob(output.blob, output.name)}>
						<Download />
						{m.common_save()}
					</Button>
				</div>
			</div>
		</div>
	);
}

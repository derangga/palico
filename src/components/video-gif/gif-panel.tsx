import { Ban, Download, ImagePlay, Loader2 } from "lucide-react";
import { useId } from "react";

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
import {
	GIF_FPS_OPTIONS,
	GIF_SIZE_OPTIONS,
	type GifFps,
	type GifSize,
} from "#/lib/video/gif-options.ts";

// Labels for <SelectValue>; without `items` it shows the raw value.
const FPS_ITEMS = GIF_FPS_OPTIONS.map((f) => ({
	value: String(f),
	label: `${f} fps`,
}));

const SIZE_ITEMS = GIF_SIZE_OPTIONS.map((s) => ({
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
						Frame rate
					</span>
					<Select
						items={FPS_ITEMS}
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
							{FPS_ITEMS.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span id={sizeLabelId} className="text-xs text-muted-foreground">
						Size
					</span>
					<Select
						items={SIZE_ITEMS}
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
							{SIZE_ITEMS.map((item) => (
								<SelectItem key={item.value} value={item.value}>
									{item.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">Output size</span>
					<span className="text-sm font-medium tabular-nums">
						{dimensions ? `${dimensions.width} × ${dimensions.height}` : "—"}
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<span className="text-xs text-muted-foreground">Clip length</span>
					<span className="text-sm font-medium tabular-nums">
						{clipSeconds.toFixed(1)} s
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
						{cancelling ? "Cancelling…" : "Cancel"}
					</Button>
				) : (
					<Button variant="ghost" className="w-full" onClick={onReset}>
						Choose another
					</Button>
				)}

				<Button className="w-full" onClick={onMake} disabled={!canMake}>
					{making ? <Loader2 className="animate-spin" /> : <ImagePlay />}
					{making ? "Making your GIF…" : "Make GIF"}
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
					alt={`Preview of ${output.name}`}
					className="max-h-64 w-full rounded-md object-contain"
				/>
			) : null}
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium">{output.name}</p>
					<p className="text-xs text-muted-foreground">
						{formatBytes(output.size)}
					</p>
				</div>
				<Button onClick={() => downloadBlob(output.blob, output.name)}>
					<Download />
					Save
				</Button>
			</div>
		</div>
	);
}

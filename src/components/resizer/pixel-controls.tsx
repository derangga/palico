import { Input } from "#/components/ui/input.tsx";

export function PixelControls({
	pxWidth,
	pxHeight,
	maintainAR,
	noEnlarge,
	onChangeWidth,
	onChangeHeight,
	onToggleAR,
	onSetNoEnlarge,
}: {
	pxWidth: string;
	pxHeight: string;
	maintainAR: boolean;
	noEnlarge: boolean;
	onChangeWidth: (value: string) => void;
	onChangeHeight: (value: string) => void;
	onToggleAR: (on: boolean) => void;
	onSetNoEnlarge: (on: boolean) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end gap-4">
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Width (px)
					</span>
					<Input
						type="number"
						min={1}
						className="w-28"
						value={pxWidth}
						onChange={(e) => onChangeWidth(e.target.value)}
					/>
				</div>
				<span className="pb-2 text-muted-foreground">×</span>
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Height (px)
					</span>
					<Input
						type="number"
						min={1}
						className="w-28"
						value={pxHeight}
						onChange={(e) => onChangeHeight(e.target.value)}
					/>
				</div>
			</div>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					className="size-4 accent-primary"
					checked={maintainAR}
					onChange={(e) => onToggleAR(e.target.checked)}
				/>
				Maintain aspect ratio
			</label>
			<label className="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					className="size-4 accent-primary"
					checked={noEnlarge}
					onChange={(e) => onSetNoEnlarge(e.target.checked)}
				/>
				Do not enlarge (no upscaling)
			</label>
		</div>
	);
}

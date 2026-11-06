import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { m } from "#/paraglide/messages.js";

const PRESETS = [75, 50, 25] as const;

export function PercentControls({
	pct,
	onChangePct,
}: {
	pct: number;
	onChangePct: (value: number) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center gap-2">
				{PRESETS.map((p) => (
					<Button
						key={p}
						variant={pct === p ? "secondary" : "outline"}
						size="sm"
						onClick={() => onChangePct(p)}
					>
						{p}%
					</Button>
				))}
				<div className="ml-2 flex items-center gap-2">
					<span className="text-xs font-medium text-muted-foreground">
						{m.resizer_custom()}
					</span>
					<Input
						type="number"
						min={1}
						max={100}
						className="w-20"
						value={pct}
						onChange={(e) => onChangePct(Number(e.target.value))}
					/>
					<span className="text-sm text-muted-foreground">%</span>
				</div>
			</div>
			<p className="text-xs text-muted-foreground">
				{m.resizer_percent_note()}
			</p>
		</div>
	);
}

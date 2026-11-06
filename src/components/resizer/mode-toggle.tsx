import type { Mode } from "#/components/resizer/state.ts";
import { Button } from "#/components/ui/button.tsx";
import { m } from "#/paraglide/messages.js";

export function ModeToggle({
	mode,
	onSetMode,
}: {
	mode: Mode;
	onSetMode: (mode: Mode) => void;
}) {
	return (
		<div className="mt-6 inline-flex gap-1 rounded-lg border bg-card p-1">
			<Button
				variant={mode === "pixels" ? "secondary" : "ghost"}
				size="sm"
				onClick={() => onSetMode("pixels")}
			>
				{m.resizer_mode_pixels()}
			</Button>
			<Button
				variant={mode === "percent" ? "secondary" : "ghost"}
				size="sm"
				onClick={() => onSetMode("percent")}
			>
				{m.resizer_mode_percent()}
			</Button>
		</div>
	);
}

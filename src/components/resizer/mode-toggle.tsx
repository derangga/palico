import type { Mode } from "#/components/resizer/state.ts";
import { Button } from "#/components/ui/button.tsx";

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
				By pixels
			</Button>
			<Button
				variant={mode === "percent" ? "secondary" : "ghost"}
				size="sm"
				onClick={() => onSetMode("percent")}
			>
				By percentage
			</Button>
		</div>
	);
}

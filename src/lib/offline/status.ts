import type { EngineSpec } from "./engines.ts";
import type { OfflineStatus, ShellState } from "./shapes.ts";

// What a tool may promise right now. Pure, so it is tested as a table.
// `cached` is undefined until the first engine check finishes.
export const computeStatus = (input: {
	readonly shell: ShellState;
	readonly engine?: Pick<EngineSpec, "sizeLabel">;
	readonly cached?: boolean;
	readonly notSaved: boolean;
}): OfflineStatus => {
	switch (input.shell._tag) {
		case "Unsupported":
			return {
				_tag: "Unavailable",
				reason: "Offline mode is not available in this browser.",
			};
		case "Failed":
			return { _tag: "Unavailable", reason: "Offline mode could not start." };
		case "Registering":
		case "Installing":
			return { _tag: "Preparing" };
		case "Active":
			break;
	}
	if (!input.engine) return { _tag: "Ready" };
	if (input.cached === undefined) return { _tag: "Preparing" };
	if (input.cached) return { _tag: "Ready" };
	if (input.notSaved) return { _tag: "NotSaved" };
	return { _tag: "NeedsDownload", sizeLabel: input.engine.sizeLabel };
};

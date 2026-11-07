import type { EngineSpec } from "./engines.ts";
import { OfflineStatus, ShellState } from "./shapes.ts";

// What a tool may promise right now. Pure, so it is tested as a table.
// `cached` is undefined until the first engine check finishes.
export const computeStatus = (input: {
	readonly shell: ShellState;
	readonly engine?: Pick<EngineSpec, "sizeLabel">;
	readonly cached?: boolean;
	readonly notSaved: boolean;
}): OfflineStatus => {
	const { Off, Unavailable, Preparing, Ready, NotSaved, NeedsDownload } =
		OfflineStatus.cases;

	return ShellState.match(input.shell, {
		Unsupported: () =>
			Unavailable.make({
				reason: "Offline mode is not available in this browser.",
			}),
		Failed: () => Unavailable.make({ reason: "Offline mode could not start." }),
		// With the shell off, an engine tool still reports its own engine: a missing
		// engine needs a download whether or not the app shell is saved.
		Off: (): OfflineStatus => {
			if (!input.engine) return Off.make({});

			if (input.cached === undefined) return Preparing.make({});

			if (input.cached) return Off.make({});

			if (input.notSaved) return NotSaved.make({});

			return NeedsDownload.make({ sizeLabel: input.engine.sizeLabel });
		},
		Registering: () => Preparing.make({}),
		Installing: () => Preparing.make({}),
		Active: (): OfflineStatus => {
			if (!input.engine) return Ready.make({});

			if (input.cached === undefined) return Preparing.make({});

			if (input.cached) return Ready.make({});

			if (input.notSaved) return NotSaved.make({});

			return NeedsDownload.make({ sizeLabel: input.engine.sizeLabel });
		},
	});
};

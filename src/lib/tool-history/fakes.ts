// Test double for ToolHistoryHost. Not imported by app code.
import { Effect, Layer, Option } from "effect";

import { ToolHistoryStorageError } from "./errors.ts";
import { ToolHistoryHost } from "./hosts.ts";

interface FakeToolHistoryState {
	stored: string | undefined;
	// How many times a write was attempted, whether or not it succeeded.
	writeAttempts: number;
}

export const makeFakeToolHistoryHost = (
	opts: { stored?: string; failRead?: boolean; failWrite?: boolean } = {},
) => {
	const state: FakeToolHistoryState = {
		stored: opts.stored,
		writeAttempts: 0,
	};

	const layer = Layer.succeed(ToolHistoryHost, {
		readStored: opts.failRead
			? Effect.fail(
					new ToolHistoryStorageError({
						operation: "read",
						message: "blocked",
					}),
				)
			: Effect.sync(() => Option.fromUndefinedOr(state.stored)),
		write: (raw) =>
			Effect.suspend(() => {
				state.writeAttempts++;

				if (opts.failWrite) {
					return Effect.fail(
						new ToolHistoryStorageError({
							operation: "write",
							message: "full",
						}),
					);
				}

				return Effect.sync(() => {
					state.stored = raw;
				});
			}),
	});

	return { layer, state };
};

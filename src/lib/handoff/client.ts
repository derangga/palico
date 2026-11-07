// The two calls the UI makes: `sendHandoff` on the source page and
// `receiveHandoff` on the target page. Both run synchronously, because the store
// is an in-memory Map.

import { Effect, Exit, ManagedRuntime, Option, Schema } from "effect";

import { HandoffMissingError } from "./errors.ts";
import { Handoff } from "./service.ts";
import { type HandoffEntry, HandoffId } from "./shapes.ts";

const handoffRuntime = ManagedRuntime.make(Handoff.layer);

const decodeId = Schema.decodeUnknownOption(HandoffId);

/** Stores the files and returns the id for `?handoff=`. */
export const putEntry = (entry: HandoffEntry) =>
	Effect.gen(function* () {
		const handoff = yield* Handoff;

		return yield* handoff.put(entry);
	});

/**
 * Takes the handoff named by the `?handoff=` param. A value that is not an id
 * fails the same way as an id that is gone: the page cannot tell them apart and
 * shows the same "Drop the file again".
 */
export const takeEntry = (param: string) =>
	Effect.gen(function* () {
		const id = yield* Option.match(decodeId(param), {
			onNone: () => Effect.fail(new HandoffMissingError({ id: param })),
			onSome: Effect.succeed,
		});
		const handoff = yield* Handoff;

		return yield* handoff.take(id);
	});

export const sendHandoff = (entry: HandoffEntry): HandoffId =>
	handoffRuntime.runSync(putEntry(entry));

export const receiveHandoff = (
	param: string,
): Exit.Exit<HandoffEntry, HandoffMissingError> =>
	handoffRuntime.runSyncExit(takeEntry(param));

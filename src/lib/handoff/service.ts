import { Context, Effect, Layer, Random } from "effect";

import { HandoffMissingError } from "./errors.ts";
import type { HandoffEntry, HandoffId } from "./shapes.ts";

export type HandoffStore = Map<string, HandoffEntry>;

// Module level on purpose: it lives exactly as long as the tab's JavaScript, so a
// reload empties it. Files never go to IndexedDB, localStorage, the Cache API or
// the URL. See docs/chain-tools.md.
const liveStore: HandoffStore = new Map();

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 8;

const nextId = Effect.gen(function* () {
	let id = "";

	for (let i = 0; i < ID_LENGTH; i++) {
		id += ID_ALPHABET[yield* Random.nextIntBetween(0, ID_ALPHABET.length)];
	}

	// SAFETY: eight characters from ID_ALPHABET match the HandoffId pattern in
	// shapes.ts by construction.
	return id as HandoffId;
});

const make = (store: HandoffStore) =>
	Effect.sync(() => {
		/**
		 * Keeps the files in memory and returns the id to put in the address. An
		 * older entry nobody took (the target never mounted its dropzone, for
		 * example an engine the person did not enable) is dropped, so at most one
		 * set of files waits in memory.
		 */
		const put = Effect.fn("Handoff.put")(function* (entry: HandoffEntry) {
			store.clear();

			const id = yield* nextId;

			store.set(id, entry);

			return id;
		});

		/** Returns the entry once and forgets it, so Back and reload cannot replay it. */
		const take = Effect.fn("Handoff.take")(function* (id: string) {
			const entry = store.get(id);

			if (entry === undefined) {
				return yield* new HandoffMissingError({ id });
			}

			store.delete(id);

			return entry;
		});

		return { put, take };
	});

/**
 * Hands files from one tool's result to the next tool's page, in memory only.
 * `put` stores them under a short random id; `take` returns them once.
 */
export class Handoff extends Context.Service<Handoff>()("palico/Handoff", {
	make: make(liveStore),
}) {
	static readonly layer = Layer.effect(this, this.make);

	/** The service over a store you supply. For tests: a fresh Map is a reload. */
	static readonly layerWith = (store: HandoffStore) =>
		Layer.effect(this, make(store));
}

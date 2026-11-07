import { Clock, Context, Effect, Layer } from "effect";

import type { ToolHistoryStorageError } from "./errors.ts";
import { ToolHistoryHost, ToolHistoryHostLive } from "./hosts.ts";
import * as Model from "./model.ts";
import type { ToolHistoryData } from "./shapes.ts";

/**
 * Favourite and recently used tools, stored under one localStorage key. Every
 * method reads fresh, applies one pure change from model.ts and writes back, so
 * two tabs never overwrite each other with a stale copy. A bad or missing value
 * is an empty history. Storage that throws fails with ToolHistoryStorageError.
 */
export class ToolHistory extends Context.Service<ToolHistory>()(
	"palico/ToolHistory",
	{
		make: Effect.gen(function* () {
			const host = yield* ToolHistoryHost;

			const load: Effect.Effect<ToolHistoryData, ToolHistoryStorageError> =
				Effect.map(host.readStored, Model.parseHistory);

			// The A path of every write: load, change, save, return the new value.
			const update = (change: (data: ToolHistoryData) => ToolHistoryData) =>
				Effect.gen(function* () {
					const next = change(yield* load);

					yield* host.write(Model.serializeHistory(next));

					return next;
				});

			const toggleFavourite = Effect.fn("ToolHistory.toggleFavourite")(
				function* (path: string) {
					return yield* update((data) => Model.toggleFavourite(data, path));
				},
			);

			// A tool counts as used when a job finishes, so callers run this at the
			// moment a result becomes available.
			const recordUse = Effect.fn("ToolHistory.recordUse")(function* (
				path: string,
			) {
				const at = yield* Clock.currentTimeMillis;

				return yield* update((data) => Model.recordUse(data, path, at));
			});

			const clearRecent = Effect.fn("ToolHistory.clearRecent")(function* () {
				return yield* update(Model.clearRecent);
			});

			return { load, toggleFavourite, recordUse, clearRecent };
		}),
	},
) {
	static readonly layer = Layer.effect(this, this.make).pipe(
		Layer.provide(ToolHistoryHostLive),
	);

	/** The service over a host you supply. For tests. */
	static readonly layerWith = (host: Layer.Layer<ToolHistoryHost>) =>
		Layer.effect(this, this.make).pipe(Layer.provide(host));
}

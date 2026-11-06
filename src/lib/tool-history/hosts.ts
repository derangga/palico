// The one browser surface the tool history touches, as an Effect service. The
// real one wraps localStorage; tests provide a fake (see fakes.ts).

import { Context, Effect, Layer, Option } from "effect";

import { ToolHistoryStorageError } from "./errors.ts";
import { STORAGE_KEY } from "./shapes.ts";

export interface ToolHistoryHostApi {
	/** The raw stored string. Untrusted: decode it before use. */
	readonly readStored: Effect.Effect<
		Option.Option<string>,
		ToolHistoryStorageError
	>;
	readonly write: (raw: string) => Effect.Effect<void, ToolHistoryStorageError>;
}

export class ToolHistoryHost extends Context.Service<
	ToolHistoryHost,
	ToolHistoryHostApi
>()("palico/ToolHistoryHost") {}

const messageOf = (cause: unknown) =>
	cause instanceof Error ? cause.message : String(cause);

export const ToolHistoryHostLive = Layer.succeed(ToolHistoryHost, {
	readStored: Effect.try({
		try: () => Option.fromNullishOr(localStorage.getItem(STORAGE_KEY)),
		catch: (cause) =>
			new ToolHistoryStorageError({
				operation: "read",
				message: messageOf(cause),
			}),
	}),
	write: (raw) =>
		Effect.try({
			try: () => localStorage.setItem(STORAGE_KEY, raw),
			catch: (cause) =>
				new ToolHistoryStorageError({
					operation: "write",
					message: messageOf(cause),
				}),
		}),
});

import { Schema } from "effect";
import type { NonEmptyReadonlyArray } from "effect/Array";

import type { ToolId } from "#/lib/tool-categories.ts";

/**
 * The short random key of one handoff. It comes back in through the address
 * bar, so a page decodes it before use. Anything else reads as a missing
 * handoff.
 */
export const HandoffId = Schema.String.check(
	Schema.isPattern(/^[a-z0-9]{8}$/),
).pipe(Schema.brand("HandoffId"));

export type HandoffId = typeof HandoffId.Type;

/** The files one tool hands to the next, and the tool they came from. */
export interface HandoffEntry {
	readonly files: NonEmptyReadonlyArray<File>;
	readonly from: ToolId;
}

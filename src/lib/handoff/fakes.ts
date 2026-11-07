// Test double for Handoff. Not imported by app code.
import { Handoff, type HandoffStore } from "./service.ts";
import type { HandoffEntry } from "./shapes.ts";

/**
 * A Handoff over its own Map. Seed it to stand for a handoff that is waiting;
 * leave it empty to stand for the page after a reload.
 */
export const makeFakeHandoff = (
	seeded: ReadonlyArray<readonly [string, HandoffEntry]> = [],
) => {
	const store: HandoffStore = new Map(seeded);

	return { layer: Handoff.layerWith(store), store };
};

// The colors a person has picked this visit, newest first. Pure, so tests cover
// the order and the limit.

import { toHex } from "./format.ts";
import type { Rgb } from "./oklab.ts";

export const MAX_PICKED = 8;

/** Puts `color` first. A color already in the list moves to the front instead of repeating. */
export const rememberColor = (
	picked: ReadonlyArray<Rgb>,
	color: Rgb,
): ReadonlyArray<Rgb> =>
	[color, ...picked.filter((other) => toHex(other) !== toHex(color))].slice(
		0,
		MAX_PICKED,
	);

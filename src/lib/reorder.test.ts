import { describe, expect, it } from "vitest";

import { moveItem } from "./reorder.ts";

describe("moveItem", () => {
	it("moves forward and backward", () => {
		expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
		expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
	});

	it("clamps targets past the ends", () => {
		expect(moveItem(["a", "b", "c"], 1, -4)).toEqual(["b", "a", "c"]);
		expect(moveItem(["a", "b", "c"], 1, 9)).toEqual(["a", "c", "b"]);
	});

	it("returns the same list for a no-op", () => {
		const list = ["a", "b"];
		expect(moveItem(list, 1, 1)).toBe(list);
		expect(moveItem(list, 5, 0)).toBe(list);
	});
});

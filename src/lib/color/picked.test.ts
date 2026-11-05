import { describe, expect, it } from "vitest";

import type { Rgb } from "./oklab.ts";
import { MAX_PICKED, rememberColor } from "./picked.ts";

const gray = (level: number): Rgb => ({ r: level, g: level, b: level });

describe("rememberColor", () => {
	it("puts the newest color first", () => {
		expect(rememberColor([gray(1)], gray(2))).toEqual([gray(2), gray(1)]);
	});

	it("moves a repeated color to the front instead of listing it twice", () => {
		expect(rememberColor([gray(1), gray(2), gray(3)], gray(3))).toEqual([
			gray(3),
			gray(1),
			gray(2),
		]);
	});

	it("keeps only the newest few", () => {
		let picked: ReadonlyArray<Rgb> = [];

		for (let level = 0; level < MAX_PICKED + 3; level++) {
			picked = rememberColor(picked, gray(level));
		}

		expect(picked).toHaveLength(MAX_PICKED);
		expect(picked[0]).toEqual(gray(MAX_PICKED + 2));
		expect(picked).not.toContainEqual(gray(0));
	});

	it("does not change the list it was given", () => {
		const before = [gray(1)];

		rememberColor(before, gray(2));

		expect(before).toEqual([gray(1)]);
	});
});

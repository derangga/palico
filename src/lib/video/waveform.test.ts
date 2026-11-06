import { describe, expect, it } from "vitest";

import { computePeaks, peaksToPath } from "./waveform.ts";

describe("computePeaks", () => {
	it("returns zeros for silence", () => {
		expect(computePeaks([new Float32Array(100)], 4)).toEqual([0, 0, 0, 0]);
	});

	it("finds a single spike and scales it to 1", () => {
		const data = new Float32Array(100);
		data[60] = -0.5;

		expect(computePeaks([data], 4)).toEqual([0, 0, 1, 0]);
	});

	it("takes the loudest sample across channels", () => {
		const left = new Float32Array(8);
		const right = new Float32Array(8);
		left[0] = 0.25;
		right[7] = 0.5;

		expect(computePeaks([left, right], 2)).toEqual([0.5, 1]);
	});

	it("does not throw with fewer samples than buckets", () => {
		const peaks = computePeaks([Float32Array.of(0.5, 1)], 8);

		expect(peaks).toHaveLength(8);
		expect(Math.max(...peaks)).toBe(1);
	});

	it("returns an empty list for no channels", () => {
		expect(computePeaks([], 3)).toEqual([0, 0, 0]);
	});
});

describe("peaksToPath", () => {
	it("draws one segment per bar", () => {
		const d = peaksToPath([0.2, 0.8, 0.5, 1], 4, 96);

		expect(d.match(/M/g)).toHaveLength(4);
	});

	it("keeps a minimum bar height so silence still draws a line", () => {
		expect(peaksToPath([0, 0], 1, 96)).toBe("M2.5 47V49");
	});

	it("returns an empty path with no bars or no peaks", () => {
		expect(peaksToPath([], 4, 96)).toBe("");
		expect(peaksToPath([1], 0, 96)).toBe("");
	});
});

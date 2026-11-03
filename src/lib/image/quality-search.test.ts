import { describe, expect, it } from "vitest";

import { COMPRESS_MAX_PASSES, searchQuality } from "./quality-search.ts";

// Fake encoder: output size grows linearly with quality (1000 bytes at q=1).
const fakeEncoder = () => {
	const calls: number[] = [];

	const encode = async (q: number) => {
		calls.push(q);

		return new Blob([new Uint8Array(Math.round(q * 1000))]);
	};

	return { calls, encode };
};

describe("searchQuality", () => {
	it("stops after one pass when the ceiling already fits", async () => {
		const { calls, encode } = fakeEncoder();
		const r = await searchQuality(encode, { targetBytes: 900, max: 0.75 });
		expect(r).toMatchObject({ quality: 0.75, targetMet: true, passes: 1 });
		expect(calls).toEqual([0.75]);
	});

	it("returns the floor result when nothing fits", async () => {
		const { calls, encode } = fakeEncoder();
		const r = await searchQuality(encode, { targetBytes: 50, max: 0.75 });
		expect(r).toMatchObject({ quality: 0.1, targetMet: false, passes: 2 });
		expect(r.blob.size).toBe(100);
		expect(calls).toEqual([0.75, 0.1]);
	});

	it("finds the highest fitting quality within the pass cap", async () => {
		const { calls, encode } = fakeEncoder();
		const r = await searchQuality(encode, { targetBytes: 400, max: 0.95 });
		expect(calls).toHaveLength(COMPRESS_MAX_PASSES);
		expect(r.targetMet).toBe(true);
		expect(r.blob.size).toBeLessThanOrEqual(400);
		expect(r.quality).toBeGreaterThan(0.38);
		expect(r.quality).toBeLessThanOrEqual(0.4);
	});

	it("does not search when the ceiling is the floor", async () => {
		const { calls, encode } = fakeEncoder();

		const r = await searchQuality(encode, {
			targetBytes: 50,
			max: 0.1,
			min: 0.1,
		});

		expect(r).toMatchObject({ targetMet: false, passes: 1 });
		expect(calls).toEqual([0.1]);
	});
});

import { describe, expect, it } from "vitest";

import type { PdfThumbnail } from "#/lib/file/pdf-types.ts";

import {
	initialOrganizeState,
	type OrganizeAction,
	type OrganizeState,
	organizeReducer,
} from "./state.ts";

// SAFETY: the reducer never reads the bitmap, and jsdom has no ImageBitmap to
// construct, so an empty stub stands in for it.
const STUB_BITMAP = {} as ImageBitmap;

const thumb = (index: number): PdfThumbnail => ({
	index,
	bitmap: STUB_BITMAP,
	width: 10,
	height: 10,
});

const run = (...actions: OrganizeAction[]): OrganizeState =>
	actions.reduce(organizeReducer, initialOrganizeState);

const loaded = (count: number): OrganizeAction[] => [
	{ type: "loadStart", file: new File([], "a.pdf") },
	...Array.from({ length: count }, (_, i) => ({
		type: "addThumbnail" as const,
		thumbnail: thumb(i),
	})),
	{ type: "loadSuccess" },
];

const order = (s: OrganizeState) => s.pages.map((p) => p.sourceIndex);

describe("organizeReducer", () => {
	it("moves, removes and restores pages", () => {
		const moved = run(...loaded(4), { type: "move", from: 3, to: 0 });
		expect(order(moved)).toEqual([3, 0, 1, 2]);

		const removed = organizeReducer(moved, { type: "remove", key: "1" });
		expect(order(removed)).toEqual([3, 0, 2]);

		expect(order(organizeReducer(removed, { type: "restore" }))).toEqual([
			0, 1, 2, 3,
		]);
	});

	it("rotates in both directions and wraps", () => {
		const s = run(
			...loaded(1),
			{ type: "rotate", key: "0", dir: -1 },
			{ type: "rotate", key: "0", dir: -1 },
		);

		expect(s.pages[0].rotation).toBe(180);
		const back = run(...loaded(1), { type: "rotate", key: "0", dir: 1 });
		expect(back.pages[0].rotation).toBe(90);
	});
});
